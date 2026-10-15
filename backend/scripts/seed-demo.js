'use strict';

// Idempotent local/demo data. This deliberately creates no queued jobs and
// never invokes Docker, so it is safe to run while reviewing the UI.
const bcrypt = require('bcryptjs');
const { getPool, closePool } = require('../src/config/db');

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@shipyard.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'ShipYardDemo123!';

async function seed() {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [userResult] = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES (?, ?, 'Demo Operator')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), id = LAST_INSERT_ID(id)`,
    [DEMO_EMAIL, passwordHash]
  );
  const userId = userResult.insertId;
  const projects = [
    { name: 'Payments API', type: 'server', repo: 'https://github.com/example/payments-api.git', url: 'https://payments-api.shipyard.localhost' },
    { name: 'Documentation Site', type: 'static', repo: 'https://github.com/example/docs-site.git', url: 'https://documentation-site.shipyard.localhost' },
  ];

  for (const [index, project] of projects.entries()) {
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [projectResult] = await pool.query(
      `INSERT INTO projects (owner_id, name, slug, repository_url, branch, deploy_type, output_dir)
       VALUES (?, ?, ?, ?, 'main', ?, 'build')
       ON DUPLICATE KEY UPDATE repository_url = VALUES(repository_url), deploy_type = VALUES(deploy_type), id = LAST_INSERT_ID(id)`,
      [userId, project.name, slug, project.repo, project.type]
    );
    const projectId = projectResult.insertId;
    await pool.query('INSERT IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, \'owner\')', [projectId, userId]);
    const [deploymentResult] = await pool.query(
      `INSERT INTO deployments (project_id, commit_sha, branch, commit_message, commit_author, triggered_by, trigger_type, status, live_url, public_url, started_at, finished_at)
       SELECT ?, ?, 'main', ?, 'ShipYard Demo', ?, 'manual', 'SUCCESS', ?, ?, NOW() - INTERVAL 12 MINUTE, NOW() - INTERVAL 10 MINUTE
       WHERE NOT EXISTS (SELECT 1 FROM deployments WHERE project_id = ? AND commit_sha = ?)`,
      [projectId, `${String(index + 1).repeat(7)}${String(index + 1).repeat(5)}`, index === 0 ? 'Add payment health checks' : 'Publish documentation navigation', userId, project.url, project.url, projectId, `${String(index + 1).repeat(7)}${String(index + 1).repeat(5)}`]
    );
    const deploymentId = deploymentResult.insertId;
    if (deploymentId) {
      await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, \'SUCCESS\', \'SUCCESS\', \'demo deployment seeded\')', [deploymentId]);
      await pool.query('INSERT INTO application_instances (project_id, deployment_id, container_id, state, started_at) VALUES (?, ?, ?, \'RUNNING\', NOW() - INTERVAL 10 MINUTE)', [projectId, deploymentId, `demo-${slug}`]);
    }
    await pool.query(
      `INSERT INTO request_logs (project_id, method, path, status_code, latency_ms, response_bytes, created_at)
       SELECT ?, 'GET', ?, 200, ?, 2048, NOW() - INTERVAL ? MINUTE
       WHERE NOT EXISTS (SELECT 1 FROM request_logs WHERE project_id = ? AND path = ?)`,
      [projectId, index === 0 ? '/health' : '/', index === 0 ? 42 : 118, index + 2, projectId, index === 0 ? '/health' : '/']
    );
  }
  console.log(`Demo data ready. Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed().catch((error) => {
  console.error(`demo seed failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
