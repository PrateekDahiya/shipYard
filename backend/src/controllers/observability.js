'use strict';

const metricsService = require('../services/metricsService');
const timeseriesService = require('../services/timeseriesService');
const runtimeStatsService = require('../services/runtimeStatsService');
const { getConfig } = require('../middleware/rateLimit');
const { getPool } = require('../config/db');

async function metrics(req, res, next) {
  try {
    const [deployments, requests] = await Promise.all([
      metricsService.deploymentStats(req.project.id),
      metricsService.requestStats(req.project.id, { sinceMinutes: 60 }),
    ]);
    res.status(200).json({ deployments, requests, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function requests(req, res, next) {
  try {
    const rows = await metricsService.listRequests(req.project.id, {
      method: req.query.method,
      status: req.query.status,
      path: req.query.path,
      limit: parseInt(req.query.limit, 10) || 100,
    });
    res.status(200).json({ requests: rows, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function series(req, res, next) {
  try {
    const type = req.query.type === 'deployments' ? 'deployments' : 'requests';
    if (type === 'deployments') {
      const points = await timeseriesService.deploymentSeries(req.project.id, req.query.days);
      return res.status(200).json({ type, points, requestId: req.id });
    }
    const points = await timeseriesService.requestSeries(req.project.id, req.query.hours);
    return res.status(200).json({ type, points, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function runtime(req, res, next) {
  try {
    const docker = require('../runtime/docker');
    const stats = await runtimeStatsService.runtimeStats(req.project.id, docker);
    res.status(200).json({ runtime: stats, requestId: req.id });
  } catch (e) {
    if (e.statusCode === 404) {
      return res.status(200).json({ runtime: { running: false }, requestId: req.id });
    }
    next(e);
  }
}

async function getRateLimit(req, res, next) {
  try {
    const cfg = await getConfig(req.project.id);
    res.status(200).json({ config: cfg || { enabled: false }, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function putRateLimit(req, res, next) {
  try {
    const { requests_per_minute: rpm, requests_per_hour: rph, enabled } = req.body || {};
    if ((rpm !== undefined && (!Number.isInteger(rpm) || rpm < 1)) || (rph !== undefined && (!Number.isInteger(rph) || rph < 1))) {
      return res.status(400).json({ error: 'invalid_rate_limit', requestId: req.id });
    }
    await getPool().query(
      'INSERT INTO rate_limit_configs (project_id, requests_per_minute, requests_per_hour, enabled) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE requests_per_minute = VALUES(requests_per_minute), requests_per_hour = VALUES(requests_per_hour), enabled = VALUES(enabled)',
      [req.project.id, rpm ?? 100, rph ?? 1000, enabled ? 1 : 0]
    );
    const cfg = await getConfig(req.project.id);
    res.status(200).json({ config: cfg, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { metrics, requests, series, runtime, getRateLimit, putRateLimit };
