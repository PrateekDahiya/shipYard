'use strict';

const { getPool } = require('../config/db');
const projectRepo = require('../repositories/projectRepo');
const auditRepo = require('../repositories/auditRepo');
const { parseMemory, parseCpu } = require('../utils/resources');

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

async function list(userId) {
  return projectRepo.listForUser(userId);
}

async function create(ownerId, data) {
  if (!data || typeof data.name !== 'string' || data.name.trim().length === 0) {
    const err = new Error('invalid_project_name');
    err.status = 400;
    throw err;
  }
  validateLimits(data);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const project = await projectRepo.createWithOwner(conn, { ownerId, data: { ...data, name: data.name.trim() } });
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
      const err = new Error('project_name_taken');
      err.status = 409;
      throw err;
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function update(userId, projectId, patch) {
  validateLimits(patch || {});
  const project = await projectRepo.updateById(projectId, patch);
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
  } catch {
    /* daemon unreachable — rows still cascade */
  }
  await projectRepo.deleteById(projectId);
  await auditRepo.record({ userId, projectId: null, action: 'project.deleted', metadata: { projectId } });
}

module.exports = { list, create, update, remove };
