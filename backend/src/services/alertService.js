'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');

async function notify(projectId, event, payload) {
  let rules;
  try {
    [rules] = await getPool().query('SELECT * FROM alert_rules WHERE project_id = ? AND event = ? AND enabled = 1', [projectId, event]);
  } catch (error) {
    // Alerting is optional and must never take down deployment/watchdog work
    // when its migration has not been applied yet.
    require('../utils/logger').warn('alert_rules_unavailable', { projectId, event, message: error.message });
    return;
  }
  await Promise.all((rules || []).map(async (rule) => {
    try {
      const body = JSON.stringify({ event, projectId, at: new Date().toISOString(), ...payload });
      const headers = { 'Content-Type': 'application/json', 'User-Agent': 'ShipYard-Alert/1.0' };
      if (rule.secret) headers['X-ShipYard-Signature'] = `sha256=${crypto.createHmac('sha256', rule.secret).update(body).digest('hex')}`;
      await fetch(rule.destination_url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
    } catch (error) {
      require('../utils/logger').warn('alert_delivery_failed', { projectId, ruleId: rule.id, event, message: error.message });
    }
  }));
}

module.exports = { notify };
