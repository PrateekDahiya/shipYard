'use strict';

const { getPool } = require('../config/db');
const secretBox = require('../utils/secretBox');

const MASK = '••••••••';

function maskValue(row) {
  if (row.is_secret) {
    return { ...row, value: MASK, masked: true };
  }
  return { ...row, masked: false };
}

async function list(projectId, { includeSecretValues = false, environment = 'production' } = {}) {
  const [rows] = await getPool().query(
    "SELECT id, project_id, `key`, `value`, is_secret, scope, target_environment, created_at, updated_at FROM environment_variables WHERE project_id = ? AND target_environment IN (?, 'both') ORDER BY `key` ASC",
    [projectId, environment]
  );
  if (includeSecretValues) {
    return rows.map((r) => ({ ...r, value: secretBox.decrypt(r.value) }));
  }
  return rows.map(maskValue);
}

async function upsert(projectId, { key, value, isSecret = true, scope = 'both', targetEnvironment = 'production' }) {
  if (!key || typeof value !== 'string') {
    const err = new Error('invalid_env');
    err.status = 400;
    throw err;
  }
  await getPool().query(
    'INSERT INTO environment_variables (project_id, `key`, `value`, is_secret, scope, target_environment) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), is_secret = VALUES(is_secret), scope = VALUES(scope)',
    [projectId, key, secretBox.encrypt(value), isSecret ? 1 : 0, scope, targetEnvironment]
  );
  const [rows] = await getPool().query(
    'SELECT id, project_id, `key`, `value`, is_secret, scope, target_environment FROM environment_variables WHERE project_id = ? AND `key` = ? AND target_environment = ? LIMIT 1',
    [projectId, key, targetEnvironment]
  );
  return maskValue(rows[0]);
}

async function remove(projectId, key, targetEnvironment = 'production') {
  const [result] = await getPool().query(
    'DELETE FROM environment_variables WHERE project_id = ? AND `key` = ? AND target_environment = ? LIMIT 1',
    [projectId, key, targetEnvironment]
  );
  return result.affectedRows > 0;
}

module.exports = { list, upsert, remove, MASK };
