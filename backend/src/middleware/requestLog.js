'use strict';

// API request logging (metadata only). Query strings are dropped because they
// may carry secrets; bodies are never stored. Writes are fire-and-forget so
// logging can never break a request. Also emits one JSON access line per call
// with the correlation id (S-003).

const { getPool } = require('../config/db');
const log = require('../utils/logger');

const SKIP_PREFIXES = ['/health', '/ready', '/metrics'];

function shouldSkip(path) {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function extractProjectId(req) {
  // Mounted routers carry :id for project-scoped routes.
  if (req.params && req.params.id && /^\d+$/.test(req.params.id) && req.baseUrl.includes('projects')) {
    return parseInt(req.params.id, 10);
  }
  return null;
}

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    try {
      const path = (req.baseUrl || '') + (req.path || '');
      if (shouldSkip(path)) {
        return;
      }
      const cleanPath = path.split('?')[0].slice(0, 1024);
      const latency = Date.now() - start;
      const size = parseInt(res.getHeader('Content-Length'), 10);
      const projectId = extractProjectId(req);
      const userId = req.user && req.user.id ? req.user.id : null;
      try {
        log.info('api_request', {
          requestId: req.id || null,
          method: req.method,
          route: cleanPath,
          status: res.statusCode,
          latencyMs: latency,
          userId,
          projectId,
        });
      } catch {
        /* logging never breaks requests */
      }
      getPool()
        .query('INSERT INTO request_logs (project_id, method, path, status_code, latency_ms, response_bytes) VALUES (?, ?, ?, ?, ?, ?)', [
          projectId,
          req.method,
          cleanPath,
          res.statusCode,
          latency,
          Number.isNaN(size) ? null : size,
        ])
        .catch(() => {});
    } catch {
      /* never break requests */
    }
  });
  next();
}

module.exports = { requestLogger, shouldSkip, extractProjectId };
