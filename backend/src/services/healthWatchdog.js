'use strict';

// Continuous health watchdog: re-probes every RUNNING/UNHEALTHY instance on a
// random 5–10s cadence and keeps the row truthful. Deploy-time probing stays
// in the worker; this loop owns steady-state truth only.
//
// Responsibilities are deliberately split:
// - Docker RestartPolicy (default unless-stopped) restarts crashed containers.
// - This watchdog never restarts anything itself: repeated probe failures flip
//   the row UNHEALTHY (+ timeline event), recovery flips it back to RUNNING.
// Everything is best-effort and failure-isolated; a down DB or daemon must
// never crash the API process.

function watchdogEnabled() {
  return String(process.env.HEALTH_WATCHDOG_ENABLED || 'true').toLowerCase() !== 'false';
}

function watchdogDelays() {
  const min = Math.max(1000, parseInt(process.env.HEALTH_WATCHDOG_MIN_MS || '5000', 10) || 5000);
  const max = Math.max(min, parseInt(process.env.HEALTH_WATCHDOG_MAX_MS || '10000', 10) || 10000);
  return { min, max };
}

function failureThreshold() {
  return Math.max(1, parseInt(process.env.HEALTH_WATCHDOG_FAILS || '3', 10) || 3);
}

function logger() {
  return require('../utils/logger');
}

async function listWatched(pool) {
  const [rows] = await pool.query(
   `SELECT i.id AS instance_id, i.project_id, i.container_id, i.state, i.deployment_id,
            i.public_health_state,
            d.app_port AS dep_port, p.app_port AS project_port,
            p.healthcheck_path, p.deploy_type, d.public_url
     FROM application_instances i
     JOIN deployments d ON d.id = i.deployment_id
     JOIN projects p ON p.id = i.project_id
     WHERE i.state IN ('RUNNING', 'UNHEALTHY')
     ORDER BY i.id ASC`
  );
  return rows || [];
}

function probeTarget(row) {
  const isStatic = row.deploy_type === 'static';
  const port = isStatic ? 80 : row.dep_port || row.project_port || 3000;
  const path = isStatic ? '/' : row.healthcheck_path || '/health';
  return { port, path };
}

function publicProbeUrl(row) {
  const path = row.deploy_type === 'static' ? '/' : row.healthcheck_path || '/health';
  return `${String(row.public_url).replace(/\/+$/, '')}${path}`;
}

async function checkPublic(pool, health, row, publicFails, threshold) {
  if (!row.public_url) {
    return;
  }
  const probe = await health.probeOnce(publicProbeUrl(row), { timeoutMs: 10000, expectedStatus: 200 });
  if (probe.ok) {
    publicFails.delete(row.instance_id);
    await pool.query("UPDATE application_instances SET public_health_state = 'UP', public_health_checked_at = NOW(), public_health_latency_ms = ? WHERE id = ?", [probe.latencyMs, row.instance_id]);
    if (row.public_health_state === 'DOWN') {
      await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [row.deployment_id, 'PUBLIC_HEALTH', 'RECOVERED', 'public URL responding again']);
    }
    return;
  }
  const count = (publicFails.get(row.instance_id) || 0) + 1;
  publicFails.set(row.instance_id, count);
  await pool.query("UPDATE application_instances SET public_health_state = ?, public_health_checked_at = NOW(), public_health_latency_ms = ? WHERE id = ?", [count >= threshold ? 'DOWN' : 'UNKNOWN', probe.latencyMs, row.instance_id]);
  if (count >= threshold && row.public_health_state !== 'DOWN') {
    await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [row.deployment_id, 'PUBLIC_HEALTH', 'DOWN', `public URL failed ${count} consecutive probes`]);
    logger().warn('public_watchdog_unhealthy', { instanceId: row.instance_id, deploymentId: row.deployment_id, failures: count, url: row.public_url });
    void require('./alertService').notify(row.project_id, 'public_unhealthy', { deploymentId: row.deployment_id, url: row.public_url, failures: count });
  }
}

// One pass over all watched instances. `fails` maps instance_id ->
// consecutive probe failures (injectable for tests). Never throws.
async function checkOnce({ pool, docker, health, fails, publicFails = new Map() }) {
  let rows = [];
  try {
    rows = await listWatched(pool);
  } catch (e) {
    logger().warn('watchdog_list_failed', { message: e && e.message });
    return { checked: 0, unhealthy: 0, recovered: 0 };
  }
  const threshold = failureThreshold();
  let unhealthy = 0;
  let recovered = 0;
  for (const row of rows) {
    try {
      try {
        await checkPublic(pool, health, row, publicFails, threshold);
      } catch (e) {
        logger().warn('public_watchdog_check_failed', { instanceId: row.instance_id, deploymentId: row.deployment_id, message: e && e.message });
      }
      const ip = await docker.containerIp(row.container_id);
      const { port, path } = probeTarget(row);
      const probe = await health.probeOnce(`http://${ip}:${port}${path}`, { timeoutMs: 5000, expectedStatus: 200 });
      if (probe.ok) {
        fails.delete(row.instance_id);
        if (row.state === 'UNHEALTHY') {
          await pool.query("UPDATE application_instances SET state = 'RUNNING' WHERE id = ?", [row.instance_id]);
          await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [
            row.deployment_id,
            'WATCHDOG',
            'RECOVERED',
            'health probe passing again',
          ]);
          logger().info('watchdog_recovered', { instanceId: row.instance_id, deploymentId: row.deployment_id });
          recovered += 1;
        }
        continue;
      }
      const count = (fails.get(row.instance_id) || 0) + 1;
      fails.set(row.instance_id, count);
      if (count >= threshold && row.state === 'RUNNING') {
        await pool.query("UPDATE application_instances SET state = 'UNHEALTHY' WHERE id = ?", [row.instance_id]);
        await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [
          row.deployment_id,
          'WATCHDOG',
          'UNHEALTHY',
          `${count} consecutive probe failures`,
        ]);
        logger().warn('watchdog_unhealthy', { instanceId: row.instance_id, deploymentId: row.deployment_id, failures: count });
        unhealthy += 1;
      }
    } catch (e) {
      // Container gone mid-pass, inspect flakiness, etc. — count it as a
      // failed probe so a vanished container still converges to UNHEALTHY.
      const count = (fails.get(row.instance_id) || 0) + 1;
      fails.set(row.instance_id, count);
      if (count >= threshold && row.state === 'RUNNING') {
        try {
          await pool.query("UPDATE application_instances SET state = 'UNHEALTHY' WHERE id = ?", [row.instance_id]);
          await pool.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [
            row.deployment_id,
            'WATCHDOG',
            'UNHEALTHY',
            `instance unreachable: ${(e && e.message) || 'unknown error'}`.slice(0, 200),
          ]);
        } catch {
          /* best effort */
        }
        logger().warn('watchdog_unhealthy', { instanceId: row.instance_id, deploymentId: row.deployment_id, failures: count });
        unhealthy += 1;
      }
    }
  }
  return { checked: rows.length, unhealthy, recovered };
}

function startHealthWatchdog() {
  const { getPool } = require('../config/db');
  const docker = require('../runtime/docker');
  const health = require('../runtime/healthcheck');
  const fails = new Map();
  const publicFails = new Map();
  const log = logger();
  let stopped = false;
  let lastListErrorAt = 0;
  log.info('health_watchdog_started', { ...watchdogDelays(), threshold: failureThreshold() });
  async function tick() {
    if (stopped) {
      return;
    }
    try {
       await checkOnce({ pool: getPool(), docker, health, fails, publicFails });
    } catch (e) {
      // checkOnce guards everything internally; this is last-resort hygiene.
      const now = Date.now();
      if (now - lastListErrorAt > 60000) {
        lastListErrorAt = now;
        log.warn('watchdog_tick_failed', { message: e && e.message });
      }
    }
    if (!stopped) {
      const { min, max } = watchdogDelays();
      setTimeout(tick, min + Math.random() * (max - min));
    }
  }
  // First pass runs immediately so a fresh boot converges in seconds.
  setImmediate(tick);
  return () => {
    stopped = true;
  };
}

module.exports = { watchdogEnabled, watchdogDelays, failureThreshold, checkOnce, startHealthWatchdog };
