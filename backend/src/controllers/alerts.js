'use strict';

const { getPool } = require('../config/db');

async function list(req, res, next) {
  try {
    const [rules] = await getPool().query('SELECT id, project_id, event, destination_url, enabled, created_at, updated_at FROM alert_rules WHERE project_id = ? ORDER BY id DESC', [req.project.id]);
    res.status(200).json({ rules, requestId: req.id });
  } catch (e) { next(e); }
}

async function create(req, res, next) {
  try {
    const { event, destination_url: destinationUrl, secret, enabled = true } = req.body || {};
    if (!['deployment_failed', 'public_unhealthy', 'deployment_succeeded'].includes(event) || !/^https:\/\//i.test(destinationUrl || '')) {
      return res.status(400).json({ error: 'invalid_alert_rule', requestId: req.id });
    }
    const [result] = await getPool().query('INSERT INTO alert_rules (project_id, event, destination_url, secret, enabled) VALUES (?, ?, ?, ?, ?)', [req.project.id, event, destinationUrl, secret || null, enabled ? 1 : 0]);
    const [[rule]] = await getPool().query('SELECT id, project_id, event, destination_url, enabled, created_at, updated_at FROM alert_rules WHERE id = ?', [result.insertId]);
    res.status(201).json({ rule, requestId: req.id });
  } catch (e) { next(e); }
}

async function remove(req, res, next) {
  try {
    await getPool().query('DELETE FROM alert_rules WHERE id = ? AND project_id = ?', [req.params.ruleId, req.project.id]);
    res.status(200).json({ ok: true, requestId: req.id });
  } catch (e) { next(e); }
}

module.exports = { list, create, remove };
