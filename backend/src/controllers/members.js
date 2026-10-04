'use strict';

// Team membership (RBAC foundation). Roles: owner (project creator, single),
// admin, developer, viewer. Enforcement: owner > admin > member.
// Only owner can grant admin or touch owners/admins.

const { getPool } = require('../config/db');
const auditRepo = require('../repositories/auditRepo');

function canManage(actorRole, targetRole, targetIsOwner) {
  if (actorRole === 'owner') {
    return true;
  }
  if (actorRole === 'admin' && !targetIsOwner && targetRole !== 'admin' && targetRole !== 'owner') {
    return true;
  }
  return false;
}

async function list(req, res, next) {
  try {
    const [rows] = await getPool().query(
      'SELECT m.user_id, u.email, m.role, m.created_at FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY m.created_at ASC',
      [req.project.id]
    );
    res.status(200).json({ members: rows, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function add(req, res, next) {
  try {
    const { email, role } = req.body || {};
    const wanted = role || 'viewer';
    if (!['admin', 'developer', 'viewer'].includes(wanted)) {
      return res.status(400).json({ error: 'invalid_role', requestId: req.id });
    }
    if (wanted === 'admin' && req.project.role !== 'owner') {
      return res.status(403).json({ error: 'forbidden', requestId: req.id });
    }
    if (req.project.role !== 'owner' && req.project.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', requestId: req.id });
    }
    const [users] = await getPool().query('SELECT id FROM users WHERE email = ? LIMIT 1', [(email || '').trim().toLowerCase()]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'user_not_found', requestId: req.id });
    }
    await getPool().query("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)", [
      req.project.id,
      users[0].id,
      wanted,
    ]);
    await auditRepo.record({ userId: req.user.id, projectId: req.project.id, action: 'member.added', metadata: { email, role: wanted } });
    res.status(200).json({ ok: true, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    const targetUserId = req.params.userId;
    const [projects] = await getPool().query('SELECT owner_id FROM projects WHERE id = ? LIMIT 1', [req.project.id]);
    const targetIsOwner = String(projects[0].owner_id) === String(targetUserId);
    const [existing] = await getPool().query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1', [
      req.project.id,
      targetUserId,
    ]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'member_not_found', requestId: req.id });
    }
    if (!canManage(req.project.role, existing[0].role, targetIsOwner)) {
      return res.status(403).json({ error: 'forbidden', requestId: req.id });
    }
    if (targetIsOwner) {
      return res.status(403).json({ error: 'cannot_remove_owner', requestId: req.id });
    }
    await getPool().query('DELETE FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1', [req.project.id, targetUserId]);
    await auditRepo.record({ userId: req.user.id, projectId: req.project.id, action: 'member.removed', metadata: { userId: targetUserId } });
    res.status(200).json({ ok: true, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, add, remove, canManage };
