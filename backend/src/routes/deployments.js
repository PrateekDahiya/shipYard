'use strict';

const express = require('express');
const controller = require('../controllers/deployments');
const auth = require('../middleware/auth');
const requireProjectAccess = require('../middleware/requireProjectAccess');
const instanceService = require('../services/instanceService');
const deploymentService = require('../services/deploymentService');
const docker = require('../runtime/docker');
const config = require('../config');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.use(auth);
router.use('/projects/:id', rateLimit);

// Nested under project: /api/projects/:id/deployments...
router.post('/projects/:id/deployments', requireProjectAccess, controller.create);
router.get('/projects/:id/deployments', requireProjectAccess, controller.list);
router.get('/projects/:id/deployments/:depId', requireProjectAccess, controller.get);
router.get('/projects/:id/deployments/:depId/logs', requireProjectAccess, controller.logs);
router.get('/projects/:id/deployments/:depId/events', requireProjectAccess, controller.events);
router.post('/projects/:id/deployments/:depId/cancel', requireProjectAccess, controller.cancel);
router.post('/projects/:id/deployments/:depId/rollback', requireProjectAccess, async (req, res, next) => {
  try {
    const result = await deploymentService.rollbackTo(req.user.id, req.project.id, req.params.depId);
    require('../utils/logger').info('deployment_rollback', {
      requestId: req.id,
      userId: req.user.id,
      projectId: req.project.id,
      deploymentId: result.deployment.id,
      sourceId: req.params.depId,
    });
    res.status(201).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

router.get('/projects/:id/webhook-config', requireProjectAccess, async (req, res, next) => {
  try {
    const { getPool } = require('../config/db');
    const [rows] = await getPool().query('SELECT full_name, webhook_secret FROM repositories WHERE project_id = ? LIMIT 1', [
      req.project.id,
    ]);
    res.status(200).json({
      webhookUrl: `${config.publicBaseUrl}/api/github/webhook`,
      linked: rows.length > 0,
      repository: rows[0] ? rows[0].full_name : null,
      secret: rows[0] ? rows[0].webhook_secret : null,
      requestId: req.id,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/projects/:id/stop', requireProjectAccess, async (req, res, next) => {
  try {
    const result = await instanceService.stop(req.user.id, req.project.id, docker);
    res.status(200).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

router.post('/projects/:id/start', requireProjectAccess, async (req, res, next) => {
  try {
    const result = await instanceService.start(req.user.id, req.project.id, docker);
    res.status(200).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

router.post('/projects/:id/restart', requireProjectAccess, async (req, res, next) => {
  try {
    try {
      await instanceService.stop(req.user.id, req.project.id, docker);
    } catch (e) {
      if (!e.status || e.message !== 'no_running_instance') {
        throw e;
      }
    }
    const result = await instanceService.start(req.user.id, req.project.id, docker);
    res.status(200).json({ ...result, restarted: true, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

module.exports = router;
