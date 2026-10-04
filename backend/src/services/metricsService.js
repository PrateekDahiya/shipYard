'use strict';

// DB-backed project metrics (all real data — no synthetic series).

const { getPool } = require('../config/db');

async function deploymentStats(projectId) {
  const [byStatus] = await getPool().query('SELECT status, COUNT(*) AS n FROM deployments WHERE project_id = ? GROUP BY status', [projectId]);
  const [dur] = await getPool().query(
    'SELECT AVG(TIMESTAMPDIFF(SECOND, started_at, finished_at)) AS avg_seconds, MAX(TIMESTAMPDIFF(SECOND, started_at, finished_at)) AS max_seconds, COUNT(*) AS finished FROM deployments WHERE project_id = ? AND started_at IS NOT NULL AND finished_at IS NOT NULL',
    [projectId]
  );
  const [recent] = await getPool().query('SELECT id, status, commit_sha, created_at, finished_at FROM deployments WHERE project_id = ? ORDER BY id DESC LIMIT 5', [
    projectId,
  ]);
  return { byStatus, durations: dur[0], recent };
}

async function requestStats(projectId, { sinceMinutes = 60 } = {}) {
  const [byStatus] = await getPool().query(
    'SELECT status_code, COUNT(*) AS n, AVG(latency_ms) AS avg_ms, MAX(latency_ms) AS max_ms FROM request_logs WHERE project_id = ? AND created_at > (NOW() - INTERVAL ? MINUTE) GROUP BY status_code',
    [projectId, sinceMinutes]
  );
  const [totals] = await getPool().query(
    'SELECT COUNT(*) AS total, SUM(status_code >= 500) AS errors FROM request_logs WHERE project_id = ? AND created_at > (NOW() - INTERVAL ? MINUTE)',
    [projectId, sinceMinutes]
  );
  return { byStatus, total: totals[0].total, errors: totals[0].errors, windowMinutes: sinceMinutes };
}

async function listRequests(projectId, { method, status, path, limit = 100 } = {}) {
  const where = ['project_id = ?'];
  const args = [projectId];
  if (method) {
    where.push('method = ?');
    args.push(method);
  }
  if (status) {
    where.push('status_code = ?');
    args.push(parseInt(status, 10));
  }
  if (path) {
    where.push('path LIKE ?');
    args.push(`%${path.slice(0, 200)}%`);
  }
  const [rows] = await getPool().query(
    `SELECT method, path, status_code, latency_ms, response_bytes, created_at FROM request_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,
    [...args, Math.min(limit, 500)]
  );
  return rows;
}

module.exports = { deploymentStats, requestStats, listRequests };
