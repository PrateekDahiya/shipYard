'use strict';

const { getPool } = require('../config/db');

async function list(req, res, next) {
  try {
    const [organizations] = await getPool().query(
      `SELECT o.id, o.name, o.slug, m.role, o.created_at
       FROM organizations o JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = ? ORDER BY o.name ASC`,
      [req.user.id]
    );
    res.status(200).json({ organizations, requestId: req.id });
  } catch (e) { next(e); }
}

async function create(req, res, next) {
  try {
    const name = String((req.body || {}).name || '').trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    if (!name || !slug) return res.status(400).json({ error: 'invalid_workspace_name', requestId: req.id });
    const uniqueSlug = `${slug}-${Date.now()}`;
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query('INSERT INTO organizations (name, slug) VALUES (?, ?)', [name, uniqueSlug]);
      await conn.query("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'owner')", [result.insertId, req.user.id]);
      await conn.commit();
      res.status(201).json({ organization: { id: result.insertId, name, slug: uniqueSlug }, requestId: req.id });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally { conn.release(); }
  } catch (e) { next(e); }
}

module.exports = { list, create };
