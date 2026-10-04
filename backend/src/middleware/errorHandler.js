'use strict';

const log = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  log.error('unhandled error', { requestId: req && req.id, message: err && err.message });
  res.status(500).json({ error: 'internal_error', requestId: req && req.id });
}

module.exports = errorHandler;
