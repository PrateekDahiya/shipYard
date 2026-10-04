'use strict';

// Prometheus instrumentation (process + HTTP + deployment pipeline).
// Scraped at GET /metrics by the Prometheus service.

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'shipyard_http_requests_total',
  help: 'API requests by method, route, status',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'shipyard_http_duration_seconds',
  help: 'API request duration seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
  registers: [register],
});

const deploymentsTotal = new client.Counter({
  name: 'shipyard_deployments_total',
  help: 'Deployments created by trigger type',
  labelNames: ['trigger'],
  registers: [register],
});

const deploymentOutcomes = new client.Counter({
  name: 'shipyard_deployment_outcomes_total',
  help: 'Deployments reaching terminal states',
  labelNames: ['status'],
  registers: [register],
});

function routeLabel(req) {
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    return `${base}${req.route.path}`;
  }
  return 'unmatched';
}

function httpMetrics(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const route = routeLabel(req);
      const ms = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
      httpDuration.observe({ method: req.method, route }, ms);
    } catch {
      /* metrics never break requests */
    }
  });
  next();
}

module.exports = { register, httpMetrics, deploymentsTotal, deploymentOutcomes };
