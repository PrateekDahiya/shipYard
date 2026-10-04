'use strict';

const express = require('express');
const controller = require('../controllers/projects');
const envController = require('../controllers/env');
const githubController = require('../controllers/github');
const membersController = require('../controllers/members');
const auth = require('../middleware/auth');
const requireProjectAccess = require('../middleware/requireProjectAccess');
const { rateLimit } = require('../middleware/rateLimit');
const sse = require('../realtime/sse');
const { listForProject } = require('../repositories/auditRepo');

const router = express.Router();

// SSE authenticates via ?token= (EventSource cannot send headers) — must be
// registered BEFORE router.use(auth), which would otherwise 401 the request.
router.get('/:id/events', sse.stream);

router.use(auth);
// Per-project fixed-window rate limiting (only acts when a config is enabled).
router.use('/:id', rateLimit);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', requireProjectAccess, controller.get);
router.patch('/:id', requireProjectAccess, controller.patch);
router.delete('/:id', requireProjectAccess, controller.remove);

router.get('/:id/env', requireProjectAccess, envController.list);
router.post('/:id/env', requireProjectAccess, envController.upsert);
router.delete('/:id/env/:key', requireProjectAccess, envController.remove);

router.post('/:id/github/link', requireProjectAccess, githubController.link);
router.get('/:id/members', requireProjectAccess, membersController.list);
router.post('/:id/members', requireProjectAccess, membersController.add);
router.delete('/:id/members/:userId', requireProjectAccess, membersController.remove);
router.get('/:id/audit', requireProjectAccess, async (req, res, next) => {
  try {
    const logs = await listForProject(req.project.id);
    res.status(200).json({ audit: logs, requestId: req.id });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
