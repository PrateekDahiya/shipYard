'use strict';

const { pingDb } = require('../config/db');
const { pingRedis } = require('../config/redis');

async function health(req, res) {
  res.status(200).json({ status: 'ok', service: 'shipyard-backend', requestId: req.id });
}

async function ready(req, res) {
  const checks = { db: 'unknown', redis: 'unknown' };
  let ok = true;
  try {
    await pingDb();
    checks.db = 'up';
  } catch {
    checks.db = 'down';
    ok = false;
  }
  try {
    await pingRedis();
    checks.redis = 'up';
  } catch {
    checks.redis = 'down';
    ok = false;
  }
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks, requestId: req.id });
}

module.exports = { health, ready };
