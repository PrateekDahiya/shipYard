'use strict';

const config = require('../config');
const { getPool } = require('../config/db');

const API = 'https://api.github.com';

function requireOAuthConfig() {
  if (!config.github.clientId || !config.github.clientSecret) {
    const err = new Error('github_oauth_not_configured');
    err.status = 503;
    throw err;
  }
}

function authUrl(state) {
  requireOAuthConfig();
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'repo read:user',
    state: state || '',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  requireOAuthConfig();
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: config.github.callbackUrl || undefined,
    }),
  });
  if (!res.ok) {
    const err = new Error('github_code_exchange_failed');
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  if (!data.access_token) {
    const err = new Error('github_code_exchange_failed');
    err.status = 502;
    throw err;
  }
  return data.access_token;
}

async function githubApi(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('github_token_invalid');
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error('github_api_error');
    err.status = 502;
    throw err;
  }
  return res.json();
}

async function getTokenForUser(userId) {
  const [rows] = await getPool().query('SELECT access_token FROM github_accounts WHERE user_id = ? LIMIT 1', [userId]);
  return rows.length ? rows[0].access_token : null;
}

async function linkAccount(userId, token) {
  const ghUser = await githubApi(token, '/user');
  await getPool().query(
    `INSERT INTO github_accounts (user_id, github_user_id, login, access_token)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE github_user_id = VALUES(github_user_id), login = VALUES(login), access_token = VALUES(access_token)`,
    [userId, ghUser.id, ghUser.login, token]
  );
  return { login: ghUser.login, github_user_id: ghUser.id };
}

async function linkRepository(userId, projectId, { github_repo_id: githubRepoId, full_name: fullName, default_branch: defaultBranch }) {
  if (!githubRepoId || !fullName) {
    const err = new Error('invalid_repository');
    err.status = 400;
    throw err;
  }
  const crypto = require('crypto');
  const [existing] = await getPool().query('SELECT webhook_secret FROM repositories WHERE project_id = ? LIMIT 1', [projectId]);
  const secret = (existing[0] && existing[0].webhook_secret) || crypto.randomBytes(24).toString('hex');
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO repositories (project_id, github_repo_id, full_name, default_branch, webhook_secret)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE github_repo_id = VALUES(github_repo_id), full_name = VALUES(full_name), default_branch = VALUES(default_branch), webhook_secret = VALUES(webhook_secret)`,
      [projectId, githubRepoId, fullName, defaultBranch || null, secret]
    );
    await conn.query('UPDATE projects SET repository_url = ? WHERE id = ? LIMIT 1', [
      `https://github.com/${fullName}`,
      projectId,
    ]);
    await conn.query('INSERT INTO audit_logs (user_id, project_id, action, metadata) VALUES (?, ?, ?, ?)', [
      userId,
      projectId,
      'project.updated',
      JSON.stringify({ github_repo: fullName }),
    ]);
    await conn.commit();
    const [rows] = await conn.query('SELECT * FROM repositories WHERE project_id = ? LIMIT 1', [projectId]);
    return rows[0];
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { authUrl, exchangeCode, githubApi, getTokenForUser, linkAccount, linkRepository };
