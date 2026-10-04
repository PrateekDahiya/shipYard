'use strict';

// Confined container shell (M17, security-critical).
// A session binds ONE user to ONE container of THEIR OWN project.
// The container must belong to the project and be RUNNING; anything else
// (host, other projects' containers, Docker socket) is unreachable by design:
// only a validated container id ever reaches docker.exec.

const { getPool } = require('../config/db');
const auditRepo = require('../repositories/auditRepo');

const SESSION_TTL_MINUTES = 15;

async function runningInstance(projectId) {
  const [rows] = await getPool().query(
    "SELECT * FROM application_instances WHERE project_id = ? AND state = 'RUNNING' ORDER BY id DESC LIMIT 1",
    [projectId]
  );
  return rows[0] || null;
}

async function openSession(userId, projectId) {
  const inst = await runningInstance(projectId);
  if (!inst) {
    const err = new Error('no_running_instance');
    err.status = 409;
    throw err;
  }
  const [result] = await getPool().query(
    "INSERT INTO shell_sessions (user_id, project_id, container_id, status) VALUES (?, ?, ?, 'open')",
    [userId, projectId, inst.container_id]
  );
  await auditRepo.record({ userId, projectId, action: 'shell.started', metadata: { sessionId: result.insertId, container: inst.container_id } });
  const [rows] = await getPool().query('SELECT * FROM shell_sessions WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0];
}

async function getSession(sessionId) {
  // age_seconds is computed in DB time: mysql2 parses TIMESTAMP into a JS
  // Date in the *client* timezone, so Date arithmetic in Node is skewed
  // whenever client and DB zones differ (observed: instant "expiry" from IST).
  const [rows] = await getPool().query(
    'SELECT *, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS age_seconds FROM shell_sessions WHERE id = ? LIMIT 1',
    [sessionId]
  );
  return rows[0] || null;
}

function isExpired(session) {
  if (session && typeof session.age_seconds === 'number') {
    return session.age_seconds > SESSION_TTL_MINUTES * 60;
  }
  const ageMs = Date.now() - new Date(session.started_at).getTime();
  return ageMs > SESSION_TTL_MINUTES * 60 * 1000;
}

async function closeSession(sessionId, { expired = false } = {}) {
  const session = await getSession(sessionId);
  if (!session || session.status !== 'open') {
    return session;
  }
  await getPool().query("UPDATE shell_sessions SET status = ?, ended_at = NOW() WHERE id = ?", [expired ? 'expired' : 'closed', sessionId]);
  await auditRepo.record({
    userId: session.user_id,
    projectId: session.project_id,
    action: 'shell.ended',
    metadata: { sessionId, reason: expired ? 'expired' : 'closed' },
  });
  return getSession(sessionId);
}

module.exports = { openSession, getSession, closeSession, isExpired, runningInstance, SESSION_TTL_MINUTES };
