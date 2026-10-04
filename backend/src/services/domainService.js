'use strict';

// Custom domains (M18): register → prove ownership via DNS TXT → route on next deploy.
// A domain takes effect in Traefik labels at the next deployment (documented);
// removal likewise stops being routed after the next deploy.

const crypto = require('crypto');
const dns = require('dns').promises;
const { getPool } = require('../config/db');
const auditRepo = require('../repositories/auditRepo');
const { BASE_DOMAIN } = require('../runtime/router');

function validateHostname(hostname) {
  if (typeof hostname !== 'string' || hostname.length > 253) {
    return false;
  }
  const h = hostname.toLowerCase();
  if (h === BASE_DOMAIN || h.endsWith(`.${BASE_DOMAIN}`)) {
    return false;
  }
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h);
}

async function list(projectId) {
  const [rows] = await getPool().query('SELECT id, hostname, kind, verified, created_at FROM domains WHERE project_id = ? ORDER BY id ASC', [projectId]);
  return rows;
}

async function register(userId, projectId, hostname) {
  const clean = String(hostname || '').toLowerCase().trim();
  if (!validateHostname(clean)) {
    const err = new Error('invalid_hostname');
    err.status = 400;
    throw err;
  }
  const token = crypto.randomBytes(24).toString('hex');
  try {
    const [result] = await getPool().query(
      "INSERT INTO domains (project_id, hostname, kind, verified, verification_token) VALUES (?, ?, 'custom', 0, ?)",
      [projectId, clean, token]
    );
    await auditRepo.record({ userId, projectId, action: 'domain.added', metadata: { hostname: clean } });
    const [rows] = await getPool().query('SELECT id, hostname, kind, verified, created_at FROM domains WHERE id = ? LIMIT 1', [result.insertId]);
    return { domain: rows[0], verificationToken: token };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const err = new Error('hostname_taken');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

async function verify(userId, projectId, domainId, resolveTxt) {
  const resolve = resolveTxt || dns.resolveTxt;
  const [rows] = await getPool().query('SELECT * FROM domains WHERE id = ? AND project_id = ? LIMIT 1', [domainId, projectId]);
  const domain = rows[0];
  if (!domain) {
    const err = new Error('domain_not_found');
    err.status = 404;
    throw err;
  }
  if (domain.verified) {
    return domain;
  }
  let records = [];
  try {
    records = await resolve(domain.hostname);
  } catch {
    const err = new Error('verification_failed');
    err.status = 400;
    throw err;
  }
  const flat = records.flat().join(' ');
  if (!flat.includes(`shipyard-verification=${domain.verification_token}`)) {
    const err = new Error('verification_failed');
    err.status = 400;
    throw err;
  }
  await getPool().query('UPDATE domains SET verified = 1 WHERE id = ?', [domainId]);
  await auditRepo.record({ userId, projectId, action: 'domain.verified', metadata: { hostname: domain.hostname } });
  const [updated] = await getPool().query('SELECT id, hostname, kind, verified, created_at FROM domains WHERE id = ? LIMIT 1', [domainId]);
  return updated[0];
}

async function remove(userId, projectId, domainId) {
  const [rows] = await getPool().query("SELECT hostname FROM domains WHERE id = ? AND project_id = ? AND kind = 'custom' LIMIT 1", [
    domainId,
    projectId,
  ]);
  if (rows.length === 0) {
    const err = new Error('domain_not_found');
    err.status = 404;
    throw err;
  }
  await getPool().query('DELETE FROM domains WHERE id = ? LIMIT 1', [domainId]);
  await auditRepo.record({ userId, projectId, action: 'domain.removed', metadata: { hostname: rows[0].hostname } });
  return { removed: true };
}

module.exports = { list, register, verify, remove, validateHostname };
