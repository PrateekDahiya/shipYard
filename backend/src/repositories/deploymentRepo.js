'use strict';

const { getPool } = require('../config/db');
const { assertTransition, isTerminal } = require('../deployment/stateMachine');
const metrics = require('../monitoring/prometheus');

async function getById(id) {
  const [rows] = await getPool().query(
    `SELECT d.*, (SELECT i.state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS instance_state,
            (SELECT i.public_health_state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS public_health_state
       FROM deployments d WHERE d.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function setPublicUrl(id, url) {
  await getPool().query('UPDATE deployments SET public_url = ? WHERE id = ?', [url || null, id]);
  return getById(id);
}

async function listForProject(projectId, limit = 50) {
  const [rows] = await getPool().query(
    `SELECT d.*, (SELECT i.state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS instance_state,
            (SELECT i.public_health_state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS public_health_state
       FROM deployments d WHERE d.project_id = ? ORDER BY d.id DESC LIMIT ?`, [
    projectId,
    Math.min(limit, 200),
  ]);
  return rows;
}

async function listPageForProject(projectId, query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;
  const where = ['d.project_id = ?'];
  const params = [projectId];
  const status = String(query.status || '').trim().toUpperCase();
  if (status === 'SUCCESS') {
    where.push('d.status = ?');
    params.push('SUCCESS');
  } else if (status === 'FAILED') {
    where.push("d.status LIKE '%FAIL%'");
  } else if (status === 'ACTIVE') {
    where.push("d.status IN ('QUEUED','CLONING','BUILDING','IMAGE_CREATED','STARTING','HEALTH_CHECKING','RUNNING')");
  } else if (status && status !== 'ALL') {
    where.push('d.status = ?');
    params.push(status);
  }
  if (query.search) {
    where.push('(d.commit_sha LIKE ? OR d.commit_message LIKE ? OR d.branch LIKE ?)');
    const search = `%${String(query.search).slice(0, 100)}%`;
    params.push(search, search, search);
  }
  if (query.from) {
    where.push('d.created_at >= ?');
    params.push(query.from);
  }
  if (query.to) {
    where.push('d.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(query.to);
  }
  const clause = where.join(' AND ');
  const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM deployments d WHERE ${clause}`, params);
  const [rows] = await getPool().query(
    `SELECT d.*, (SELECT i.state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS instance_state,
            (SELECT i.public_health_state FROM application_instances i WHERE i.deployment_id = d.id ORDER BY i.id DESC LIMIT 1) AS public_health_state
       FROM deployments d WHERE ${clause} ORDER BY d.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const total = Number(countRows[0] && countRows[0].total) || 0;
  return { deployments: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
}

async function create({ projectId, commitSha, branch, commitMessage, commitAuthor, triggeredBy, triggerType, buildCommand, runCommand, appPort, rollbackOf, environment = 'production', previewKey = null, promotedFrom = null }) {
  if (!commitSha || typeof commitSha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(commitSha.trim())) {
    const err = new Error('invalid_commit_sha');
    err.status = 400;
    throw err;
  }
  const [result] = await getPool().query(
    `INSERT INTO deployments
     (project_id, commit_sha, branch, commit_message, commit_author, triggered_by, trigger_type, rollback_of, status, environment, preview_key, promoted_from, build_command, run_command, app_port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      commitSha,
      branch || 'main',
      commitMessage || null,
      commitAuthor || null,
      triggeredBy || null,
      triggerType || 'manual',
      rollbackOf || null,
      environment || 'production',
      previewKey || null,
      promotedFrom || null,
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

module.exports = { getById, listForProject, listPageForProject, create, transition, appendLog, logsFor, eventsFor, setPublicUrl };
