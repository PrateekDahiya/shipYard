'use strict';

const { getPool } = require('../config/db');

// Never pass secret values in metadata — callers must pass redacted descriptors.
async function record({ userId, projectId, action, metadata }) {
  await getPool().query('INSERT INTO audit_logs (user_id, project_id, action, metadata) VALUES (?, ?, ?, ?)', [
    userId || null,
    projectId || null,
    action,
    metadata ? JSON.stringify(metadata) : null,
  ]);
}

async function listForProject(projectId, limit = 100) {
  const [rows] = await getPool().query(
    'SELECT id, user_id, project_id, action, metadata, created_at FROM audit_logs WHERE project_id = ? ORDER BY id DESC LIMIT ?',
    [projectId, Math.min(limit, 500)]
  );
  return rows;
}

module.exports = { record, listForProject };
