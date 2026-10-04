'use strict';

const { getPool } = require('../config/db');

// Project-level authorization. Requires auth() first.
// Resolves :id param, verifies owner or project_members row.
// Sets req.project = { id, role } where role is 'owner' or member role.
async function requireProjectAccess(req, res, next) {
  const projectId = req.params.id;
  const userId = req.user && req.user.id;
  if (!userId) {
    return res.status(401).json({ error: 'unauthorized', requestId: req.id });
  }
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'project_not_found', requestId: req.id });
    }
    const project = rows[0];
    if (String(project.owner_id) === String(userId)) {
      req.project = { id: project.id, role: 'owner' };
      return next();
    }
    const [members] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
      [projectId, userId]
    );
    if (members.length === 0) {
      return res.status(403).json({ error: 'forbidden', requestId: req.id });
    }
    req.project = { id: project.id, role: members[0].role };
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = requireProjectAccess;
