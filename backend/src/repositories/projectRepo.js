'use strict';

const { getPool } = require('../config/db');

const ALLOWED_FIELDS = [
  'name',
  'repository_url',
  'branch',
  'build_command',
  'run_command',
  'working_directory',
  'app_port',
  'healthcheck_path',
  'healthcheck_timeout',
  'deploy_timeout',
  'cpu_limit',
  'memory_limit',
  'auto_deploy',
  'deploy_type',
  'output_dir',
];

function filterUpdate(body) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out;
}

async function listForUser(userId) {
  const [rows] = await getPool().query(
    `SELECT p.* FROM projects p WHERE p.owner_id = ?
     UNION
     SELECT p.* FROM projects p
     JOIN project_members m ON m.project_id = p.id
     WHERE m.user_id = ?
     ORDER BY updated_at DESC`,
    [userId, userId]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await getPool().query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function createWithOwner(conn, { ownerId, data }) {
  const [result] = await conn.query(
    `INSERT INTO projects
     (owner_id, name, repository_url, branch, build_command, run_command, working_directory,
      app_port, healthcheck_path, healthcheck_timeout, deploy_timeout, cpu_limit, memory_limit, auto_deploy, deploy_type, output_dir)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      data.name,
      data.repository_url || null,
      data.branch || 'main',
      data.build_command || null,
      data.run_command || null,
      data.working_directory || '/',
      data.app_port ?? 3000,
      data.healthcheck_path || '/health',
      data.healthcheck_timeout ?? 10,
      data.deploy_timeout ?? 600,
      data.cpu_limit || null,
      data.memory_limit || null,
      data.auto_deploy ? 1 : 0,
      data.deploy_type || 'server',
      data.output_dir || 'build',
    ]
  );
  await conn.query(
    "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner') ON DUPLICATE KEY UPDATE role='owner'",
    [result.insertId, ownerId]
  );
  const [rows] = await conn.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0];
}

async function updateById(id, patch) {
  const fields = filterUpdate(patch);
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    return getById(id);
  }
  const set = keys.map((k) => `\`${k}\` = ?`).join(', ');
  await getPool().query(`UPDATE projects SET ${set} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  return getById(id);
}

async function deleteById(id) {
  await getPool().query('DELETE FROM projects WHERE id = ? LIMIT 1', [id]);
}

module.exports = { listForUser, getById, createWithOwner, updateById, deleteById, filterUpdate };
