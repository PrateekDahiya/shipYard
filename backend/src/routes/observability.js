'use strict';

const express = require('express');
const controller = require('../controllers/observability');
const auth = require('../middleware/auth');
const requireProjectAccess = require('../middleware/requireProjectAccess');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// NOTE: the SSE stream lives in routes/projects.js (registered before that
// router's auth middleware). It cannot live here: /api/projects/* requests
// enter the projects router first, whose router.use(auth) would 401 them.

router.use(auth);
router.use('/projects/:id', rateLimit);
router.get('/overview', async (req, res, next) => {
  try {
    const { overview } = require('../services/overviewService');
    res.status(200).json({ ...(await overview(req.user.id)), requestId: req.id });
  } catch (e) {
    next(e);
  }
});
router.get('/projects/:id/metrics', requireProjectAccess, controller.metrics);
router.get('/projects/:id/metrics/series', requireProjectAccess, controller.series);
router.get('/projects/:id/runtime', requireProjectAccess, controller.runtime);
router.get('/projects/:id/requests', requireProjectAccess, controller.requests);
router.get('/projects/:id/rate-limit', requireProjectAccess, controller.getRateLimit);
router.put('/projects/:id/rate-limit', requireProjectAccess, controller.putRateLimit);

module.exports = router;
