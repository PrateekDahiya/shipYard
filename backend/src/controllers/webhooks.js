'use strict';

// Public GitHub webhook receiver. No session auth — HMAC signature is the
// credential. Mounted BEFORE express.json with a raw body parser (see app.js).

const webhookService = require('../services/webhookService');
const log = require('../utils/logger');

async function receive(req, res) {
  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.status(200).json({ ignored: true, reason: 'event_not_handled', requestId: req.id });
  }
  try {
    const result = await webhookService.handlePush({
      rawBody: req.body,
      signature: req.headers['x-hub-signature-256'],
    });
    if (result.ignored || result.skipped) {
      log.info('webhook_ignored', { requestId: req.id, reason: result.reason });
      return res.status(200).json({ ...result, requestId: req.id });
    }
    if (result.duplicate) {
      log.info('webhook_duplicate', { requestId: req.id, deploymentId: result.deployment.id, projectId: result.deployment.project_id });
      return res.status(200).json({ ...result, requestId: req.id });
    }
    log.info('webhook_deployment', {
      requestId: req.id,
      deploymentId: result.deployment.id,
      projectId: result.deployment.project_id,
      sha: result.deployment.commit_sha,
      queued: result.queued,
    });
    return res.status(201).json({ ...result, requestId: req.id });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'internal_error', requestId: req.id });
  }
}

module.exports = { receive };
