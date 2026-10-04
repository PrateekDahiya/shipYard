'use strict';

const { getPool } = require('../config/db');
const { assertTransition, isTerminal } = require('../deployment/stateMachine');
const metrics = require('../monitoring/prometheus');

async function getById(id) {
  const [rows] = await getPool().query('SELECT * FROM deployments WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function listForProject(projectId, limit = 50) {
  const [rows] = await getPool().query('SELECT * FROM deployments WHERE project_id = ? ORDER BY id DESC LIMIT ?', [
    projectId,
    Math.min(limit, 200),
  ]);
  return rows;
}

async function create({ projectId, commitSha, branch, commitMessage, commitAuthor, triggeredBy, triggerType, buildCommand, runCommand, appPort, rollbackOf }) {
  if (!commitSha || typeof commitSha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(commitSha.trim())) {
    const err = new Error('invalid_commit_sha');
    err.status = 400;
    throw err;
  }
  const [result] = await getPool().query(
    `INSERT INTO deployments
     (project_id, commit_sha, branch, commit_message, commit_author, triggered_by, trigger_type, rollback_of, status, build_command, run_command, app_port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)`,
    [
      projectId,
      commitSha,
      branch || 'main',
      commitMessage || null,
      commitAuthor || null,
      triggeredBy || null,
      triggerType || 'manual',
      rollbackOf || null,
      buildCommand || null,
      runCommand || null,
      appPort ?? null,
    ]
  );
  await getPool().query(
    "INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, 'QUEUED', 'QUEUED', 'deployment created')",
    [result.insertId]
  );
  const created = await getById(result.insertId);
  try {
    const bus = require('../realtime/bus');
    bus.publish({ type: 'DEPLOYMENT_CREATED', projectId, deploymentId: result.insertId, data: { status: 'QUEUED' } });
    metrics.deploymentsTotal.inc({ trigger: triggerType || 'manual' });
  } catch {
    /* realtime/metrics are best-effort */
  }
  return created;
}

async function transition(id, to, message) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT status FROM deployments WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (rows.length === 0) {
      const err = new Error('deployment_not_found');
      err.status = 404;
      throw err;
    }
    assertTransition(rows[0].status, to);
    const from = rows[0].status;
    if (to === 'CLONING') {
      await conn.query('UPDATE deployments SET status = ?, started_at = NOW() WHERE id = ?', [to, id]);
    } else if (['SUCCESS', 'CANCELLED'].includes(to) || to.endsWith('_FAILED')) {
      await conn.query('UPDATE deployments SET status = ?, finished_at = NOW() WHERE id = ?', [to, id]);
    } else {
      await conn.query('UPDATE deployments SET status = ? WHERE id = ?', [to, id]);
    }
    await conn.query('INSERT INTO deployment_events (deployment_id, stage, status, message) VALUES (?, ?, ?, ?)', [
      id,
      to,
      to,
      message || null,
    ]);
    await conn.commit();
    const updated = await getById(id);
    try {
      const bus = require('../realtime/bus');
      bus.publish({ type: 'DEPLOYMENT_STATUS', projectId: updated.project_id, deploymentId: id, data: { status: to, message: message || null } });
      if (isTerminal(to)) {
        metrics.deploymentOutcomes.inc({ status: to });
      }
      require('../utils/logger').info('deployment_transition', { deploymentId: id, projectId: updated.project_id, from, to });
    } catch {
      /* realtime/metrics/logs are best-effort */
    }
    return updated;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* noop */
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function appendLog(deploymentId, source, stream, line) {
  await getPool().query('INSERT INTO build_logs (deployment_id, source, stream, line) VALUES (?, ?, ?, ?)', [
    deploymentId,
    source,
    stream,
    String(line).slice(0, 16000),
  ]);
  try {
    const bus = require('../realtime/bus');
    getById(deploymentId)
      .then((d) => {
        if (d) {
          bus.publish({ type: 'DEPLOYMENT_LOG', projectId: d.project_id, deploymentId, data: { source, stream, line: String(line).slice(0, 4000) } });
        }
      })
      .catch(() => {});
  } catch {
    /* realtime is best-effort */
  }
}

async function logsFor(deploymentId, limit = 500) {
  const [rows] = await getPool().query('SELECT source, stream, line, created_at FROM build_logs WHERE deployment_id = ? ORDER BY id ASC LIMIT ?', [
    deploymentId,
    Math.min(limit, 2000),
  ]);
  return rows;
}

async function eventsFor(deploymentId) {
  const [rows] = await getPool().query('SELECT stage, status, message, created_at FROM deployment_events WHERE deployment_id = ? ORDER BY id ASC', [
    deploymentId,
  ]);
  return rows;
}

module.exports = { getById, listForProject, create, transition, appendLog, logsFor, eventsFor };
