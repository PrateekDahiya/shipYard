'use strict';

const { getPool, closePool } = require('../src/config/db');

async function cleanup() {
  const days = Math.max(1, Number.parseInt(process.env.LOG_RETENTION_DAYS || '30', 10) || 30);
  const pool = getPool();
  const [builds] = await pool.query(`DELETE FROM build_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
  const [requests] = await pool.query(`DELETE FROM request_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
  const [events] = await pool.query(`DELETE FROM deployment_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
  console.log(JSON.stringify({ days, buildLogs: builds.affectedRows, requestLogs: requests.affectedRows, deploymentEvents: events.affectedRows }));
}

cleanup().catch((error) => {
  console.error(`log cleanup failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
