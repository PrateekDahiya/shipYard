'use strict';

// Hour-bucketed time series for graphs (S-005). Pure SQL aggregation over
// request_logs + deployments — no synthetic points.

const { getPool } = require('../config/db');

async function requestSeries(projectId, hours = 24) {
  const h = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
  const [rows] = await getPool().query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS bucket,
      COUNT(*) AS total,
      SUM(status_code >= 500) AS errors,
      AVG(latency_ms) AS avg_ms,
      MAX(latency_ms) AS max_ms
     FROM request_logs
     WHERE project_id = ? AND created_at > (NOW() - INTERVAL ? HOUR)
     GROUP BY bucket ORDER BY bucket ASC`,
    [projectId, h]
  );
  return rows.map((r) => ({ bucket: r.bucket, total: Number(r.total), errors: Number(r.errors || 0), avgMs: r.avg_ms == null ? null : Number(r.avg_ms), maxMs: r.max_ms == null ? null : Number(r.max_ms) }));
}

async function deploymentSeries(projectId, days = 14) {
  const d = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);
  const [rows] = await getPool().query(
    `SELECT DATE(created_at) AS bucket, status, COUNT(*) AS n FROM deployments
     WHERE project_id = ? AND created_at > (NOW() - INTERVAL ? DAY)
     GROUP BY bucket, status ORDER BY bucket ASC`,
    [projectId, d]
  );
  return rows.map((r) => ({ bucket: String(r.bucket).slice(0, 10), status: r.status, n: Number(r.n) }));
}

module.exports = { requestSeries, deploymentSeries };
