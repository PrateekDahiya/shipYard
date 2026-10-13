'use strict';

const { getPool } = require('../config/db');
const projectRepo = require('../repositories/projectRepo');
const auditRepo = require('../repositories/auditRepo');
const { parseMemory, parseCpu } = require('../utils/resources');
const { slugify } = require('../runtime/router');

function validateLimits(data) {
  if (data.memory_limit !== undefined) {
    parseMemory(data.memory_limit);
  }
  if (data.cpu_limit !== undefined) {
    parseCpu(data.cpu_limit);
  }
  if (data.deploy_type !== undefined && data.deploy_type !== 'server' && data.deploy_type !== 'static') {
    const err = new Error('invalid_deploy_type');
    err.status = 400;
    throw err;
  }
  if (data.restart_policy !== undefined && data.restart_policy !== null && !['unless-stopped', 'always', 'on-failure', 'never'].includes(data.restart_policy)) {
    const err = new Error('invalid_restart_policy');
    err.status = 400;
    throw err;
  }
  if (data.output_dir !== undefined) {
    // Allow nested paths like frontend/dist but no traversal or absolute paths.
    const dir = String(data.output_dir);
    const segs = dir.split('/');
    if (
      dir.length === 0 ||
      dir.length > 255 ||
      dir.startsWith('/') ||
      !segs.every((s) => /^[A-Za-z0-9_.-]+$/.test(s) && s !== '.' && s !== '..')
    ) {
      const err = new Error('invalid_output_dir');
      err.status = 400;
      throw err;
    }
  }
}

function hostnameTakenError() {
  const err = new Error('project_hostname_taken');
  err.status = 409;
  return err;
}

async function list(userId) {
  return projectRepo.listForUser(userId);
}

// Live hostnames (<slug>.<base-domain>, one Traefik) are a GLOBAL namespace,
// while project names are only unique per owner (uq_projects_owner_name).
// Without this check, "My API" vs "my-api" — or two owners' "my-api" — would
// claim the same hostname and Traefik would route both to one container.
// (Same-port services are fine and need no guard: container names, image
// tags and host ports are unique per deployment, routing is hostname-based.)
async function assertHostnameAvailable(queryable, name, excludeId) {
  const slug = slugify(name);
  if (!slug) {
    const err = new Error('invalid_project_name');
    err.status = 400;
    throw err;
  }
  const [rows] = await queryable.query('SELECT id, name FROM projects');
  const clash = (rows || []).find((r) => String(r.id) !== String(excludeId) && slugify(r.name) === slug);
  if (clash) {
    const err = new Error('project_hostname_taken');
    err.status = 409;
    throw err;
  }
}

async function create(ownerId, data) {
  if (!data || typeof data.name !== 'string' || data.name.trim().length === 0) {
    const err = new Error('invalid_project_name');
    err.status = 400;
    throw err;
  }
  validateLimits(data);
  await assertHostnameAvailable(getPool(), data.name.trim(), null);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const project = await projectRepo.createWithOwner(conn, { ownerId, data: { ...data, name: data.name.trim(), slug: slugify(data.name.trim()) } });
    await conn.query('INSERT INTO audit_logs (user_id, project_id, action, metadata) VALUES (?, ?, ?, ?)', [
      ownerId,
      project.id,
      'project.created',
      JSON.stringify({ name: project.name }),
    ]);
    await conn.commit();
    return project;
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') {
      if (String(e.message || '').includes('uq_projects_slug')) {
        throw hostnameTakenError();
      }
      const err = new Error('project_name_taken');
      err.status = 409;
      throw err;
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function update(userId, projectId, patch, docker) {
  validateLimits(patch || {});
  let next = patch;
  if (patch && patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      const err = new Error('invalid_project_name');
      err.status = 400;
      throw err;
    }
    await assertHostnameAvailable(getPool(), patch.name.trim(), projectId);
    next = { ...patch, name: patch.name.trim(), slug: slugify(patch.name.trim()) };
  }
  let project;
  try {
    project = await projectRepo.updateById(projectId, next);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' && String(e.message || '').includes('uq_projects_slug')) {
      throw hostnameTakenError();
    }
    throw e;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'restart_policy') && docker && docker.updateRestartPolicy) {
    try {
      const [instances] = await getPool().query(
        "SELECT container_id FROM application_instances WHERE project_id = ? AND state IN ('RUNNING','STARTING','UNHEALTHY')",
        [projectId]
      );
      for (const instance of instances || []) {
        await docker.updateRestartPolicy(instance.container_id, project.restart_policy);
      }
    } catch (e) {
      // Persisted settings still apply to the next deployment. A temporarily
      // unavailable daemon must not make a successful settings save look lost.
      require('../utils/logger').warn('restart_policy_live_update_failed', { projectId, message: e && e.message });
    }
  }
  await auditRepo.record({ userId, projectId, action: 'project.updated', metadata: { fields: Object.keys(patch || {}) } });
  return project;
}

async function remove(userId, projectId, docker) {
  // Tear down live containers BEFORE the cascade delete removes instance rows,
  // otherwise containers are orphaned (observed live 2026-10-04). Best effort:
  // project deletion must succeed even when the daemon is unreachable.
  try {
    const instanceService = require('./instanceService');
    await instanceService.stopAllForProject(projectId, docker || require('../runtime/docker'));
    const tunnelService = require('./tunnelService');
    await tunnelService.removeProjectTunnels(projectId, docker || require('../runtime/docker'));
  } catch {
    /* daemon unreachable — rows still cascade */
  }
  await projectRepo.deleteById(projectId);
  await auditRepo.record({ userId, projectId: null, action: 'project.deleted', metadata: { projectId } });
}

module.exports = { list, create, update, remove };
