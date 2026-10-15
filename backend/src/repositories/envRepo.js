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

async function upsert(projectId, { key, value, isSecret = true, scope = 'both', targetEnvironment = 'production', createdBy = null }) {
  if (!key || typeof value !== 'string') {
    const err = new Error('invalid_env');
    err.status = 400;
    throw err;
  }
  await getPool().query(
    'INSERT INTO environment_variables (project_id, `key`, `value`, is_secret, scope, target_environment) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), is_secret = VALUES(is_secret), scope = VALUES(scope)',
    [projectId, key, secretBox.encrypt(value), isSecret ? 1 : 0, scope, targetEnvironment]
  );
  const [[versionRow]] = await getPool().query('SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM environment_variable_versions WHERE project_id = ? AND `key` = ? AND target_environment = ?', [projectId, key, targetEnvironment]);
  await getPool().query(
    'INSERT INTO environment_variable_versions (project_id, `key`, target_environment, `value`, is_secret, scope, version, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [projectId, key, targetEnvironment, secretBox.encrypt(value), isSecret ? 1 : 0, scope, versionRow.next_version, createdBy]
  );
  const [rows] = await getPool().query(
    'SELECT id, project_id, `key`, `value`, is_secret, scope, target_environment FROM environment_variables WHERE project_id = ? AND `key` = ? AND target_environment = ? LIMIT 1',
    [projectId, key, targetEnvironment]
  );
  return maskValue(rows[0]);
}

async function history(projectId, key, targetEnvironment = 'production') {
  const [rows] = await getPool().query(
    'SELECT id, `key`, target_environment, is_secret, scope, version, created_by, created_at FROM environment_variable_versions WHERE project_id = ? AND `key` = ? AND target_environment = ? ORDER BY version DESC',
    [projectId, key, targetEnvironment]
  );
  return rows;
}

async function rollback(projectId, key, version, targetEnvironment = 'production', createdBy = null) {
  const [[row]] = await getPool().query('SELECT * FROM environment_variable_versions WHERE project_id = ? AND `key` = ? AND target_environment = ? AND version = ? LIMIT 1', [projectId, key, targetEnvironment, version]);
  if (!row) {
    const err = new Error('env_version_not_found');
    err.status = 404;
    throw err;
  }
  return upsert(projectId, { key, value: secretBox.decrypt(row.value), isSecret: !!row.is_secret, scope: row.scope, targetEnvironment, createdBy });
}

async function remove(projectId, key, targetEnvironment = 'production') {
  const [result] = await getPool().query(
    'DELETE FROM environment_variables WHERE project_id = ? AND `key` = ? AND target_environment = ? LIMIT 1',
    [projectId, key, targetEnvironment]
  );
  return result.affectedRows > 0;
}

module.exports = { list, upsert, history, rollback, remove, MASK };
