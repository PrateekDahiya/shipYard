'use strict';

// Live container resource usage (S-008): memory, CPU %, writable-layer disk,
// network I/O — read on demand from the daemon for the project's current
// RUNNING instance. No background collector; numbers are point-in-time real.

function cpuPercent(stat) {
  try {
    const cpuDelta = (stat.cpu_stats.cpu_usage.total_usage || 0) - (stat.precpu_stats.cpu_usage.total_usage || 0);
    const sysDelta = (stat.cpu_stats.system_cpu_usage || 0) - (stat.precpu_stats.system_cpu_usage || 0);
    const cpus = (stat.cpu_stats.online_cpus || (stat.cpu_stats.cpu_usage.percpu_usage || []).length || 1);
    if (sysDelta <= 0 || cpuDelta < 0) {
      return 0;
    }
    return Math.round(((cpuDelta / sysDelta) * cpus * 100 + Number.EPSILON) * 100) / 100;
  } catch {
    return 0;
  }
}

async function runtimeStats(projectId, docker) {
  const { getPool } = require('../config/db');
  const [rows] = await getPool().query(
    "SELECT container_id, deployment_id FROM application_instances WHERE project_id = ? AND state = 'RUNNING' ORDER BY id DESC LIMIT 1",
    [projectId]
  );
  if (rows.length === 0) {
    return { running: false };
  }
  const containerId = rows[0].container_id;
  let info;
  let stat;
  try {
    const container = docker.getContainer(containerId);
    [info, stat] = await Promise.all([
      container.inspect({ size: true }),
      container.stats({ stream: false }),
    ]);
  } catch (e) {
    // Best-effort observability: a stale RUNNING row (container pruned),
    // an unreachable daemon, or a transient daemon error must not 500 the
    // endpoint — degrade to not-running so callers show a clean empty state.
    // DB failures still propagate above as real errors.
    const log = require('../utils/logger');
    log.warn('runtime_stats_unavailable', {
      projectId,
      containerId,
      message: e && e.message,
      statusCode: e && e.statusCode,
      code: e && e.code,
    });
    return { running: false };
  }
  const memUsage = (stat.memory_stats && stat.memory_stats.usage) || 0;
  const memLimit = (stat.memory_stats && stat.memory_stats.limit) || 0;
  const networks = stat.networks || {};
  let rx = 0;
  let tx = 0;
  for (const iface of Object.values(networks)) {
    rx += (iface && iface.rx_bytes) || 0;
    tx += (iface && iface.tx_bytes) || 0;
  }
  return {
    running: true,
    containerId,
    deploymentId: rows[0].deployment_id,
    cpuPercent: cpuPercent(stat),
    memoryBytes: memUsage,
    memoryLimitBytes: memLimit,
    diskWritableBytes: info.SizeRw || 0,
    diskRootFsBytes: info.SizeRootFs || 0,
    netRxBytes: rx,
    netTxBytes: tx,
    startedAt: info.State && info.State.StartedAt,
  };
}

module.exports = { runtimeStats, cpuPercent };
