'use strict';

// Platform overview for the dashboard (S-007): rollup across the caller's
// projects — all real data, no synthetic series.

const { getPool } = require('../config/db');

async function overview(userId) {
  const [projects] = await getPool().query(
    `SELECT p.id, p.name, p.repository_url, p.branch, p.deploy_type FROM projects p
     WHERE p.owner_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?)
     ORDER BY p.updated_at DESC LIMIT 20`,
    [userId, userId]
  );
  if (projects.length === 0) {
    return { projects: [], counts: { live: 0, failed: 0, total: 0 }, recentFailures: [] };
  }
  const ids = projects.map((p) => p.id);
  const [latest] = await getPool().query(
    `SELECT d.project_id, d.id, d.status, d.commit_sha, d.live_url, d.created_at FROM deployments d
     JOIN (SELECT project_id, MAX(id) AS id FROM deployments WHERE project_id IN (${ids.map(() => '?').join(',')}) GROUP BY project_id) m
     ON m.id = d.id`,
    ids
  );
  const byProject = new Map(latest.map((d) => [d.project_id, d]));
  const [failures] = await getPool().query(
    `SELECT d.id, d.project_id, d.status, d.commit_sha, d.created_at, p.name AS project_name FROM deployments d
     JOIN projects p ON p.id = d.project_id
     WHERE d.project_id IN (${ids.map(() => '?').join(',')})
     AND (d.status LIKE '%_FAILED' OR d.status = 'DEPLOYMENT_FAILED')
     ORDER BY d.id DESC LIMIT 10`,
    ids
  );
  const cards = projects.map((p) => ({ ...p, latest: byProject.get(p.id) || null }));
  const live = cards.filter((c) => c.latest && (c.latest.status === 'SUCCESS' || c.latest.status === 'RUNNING')).length;
  const failed = cards.filter((c) => c.latest && c.latest.status.endsWith('_FAILED')).length;
  return { projects: cards, counts: { live, failed, total: projects.length }, recentFailures: failures };
}

module.exports = { overview };
