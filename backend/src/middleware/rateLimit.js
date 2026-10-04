'use strict';

// Fixed-window per-project rate limiting (see ADR-005).
// Redis-backed counters (INCR + EXPIRE); fails OPEN when Redis is down so
// the API stays available — the outage is visible via /ready instead.
// Applies only to project-scoped routes with an enabled config row.

const { getPool } = require('../config/db');
const { getRedis } = require('../config/redis');

async function getConfig(projectId) {
  const [rows] = await getPool().query('SELECT requests_per_minute, requests_per_hour, enabled FROM rate_limit_configs WHERE project_id = ? LIMIT 1', [
    projectId,
  ]);
  return rows[0] || null;
}

async function checkFixedWindow(redis, key, limit, windowSeconds) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const ttl = await redis.ttl(key);
  return { allowed: count <= limit, count, resetIn: ttl < 0 ? windowSeconds : ttl };
}

async function rateLimit(req, res, next) {
  const projectId = req.params && req.params.id;
  if (!projectId || !/^\d+$/.test(projectId)) {
    return next();
  }
  try {
    const cfg = await getConfig(projectId);
    if (!cfg || !cfg.enabled) {
      return next();
    }
    const redis = getRedis();
    const minute = await checkFixedWindow(redis, `shipyard:rl:${projectId}:min`, cfg.requests_per_minute, 60);
    if (!minute.allowed) {
      res.setHeader('Retry-After', String(minute.resetIn));
      return res.status(429).json({ error: 'rate_limit_exceeded', window: 'minute', requestId: req.id });
    }
    const hour = await checkFixedWindow(redis, `shipyard:rl:${projectId}:hour`, cfg.requests_per_hour, 3600);
    if (!hour.allowed) {
      res.setHeader('Retry-After', String(hour.resetIn));
      return res.status(429).json({ error: 'rate_limit_exceeded', window: 'hour', requestId: req.id });
    }
    res.setHeader('X-RateLimit-Minute-Remaining', String(Math.max(0, cfg.requests_per_minute - minute.count)));
    return next();
  } catch {
    // Redis down (or DB hiccup): fail open, API stays available.
    return next();
  }
}

module.exports = { rateLimit, getConfig };
