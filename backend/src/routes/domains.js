'use strict';

const express = require('express');
const domainService = require('../services/domainService');
const auth = require('../middleware/auth');
const requireProjectAccess = require('../middleware/requireProjectAccess');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.use(auth);
router.use('/projects/:id', rateLimit);

router.get('/projects/:id/domains', requireProjectAccess, async (req, res, next) => {
  try {
    res.status(200).json({ domains: await domainService.list(req.project.id), requestId: req.id });
  } catch (e) {
    next(e);
  }
});

router.post('/projects/:id/domains', requireProjectAccess, async (req, res, next) => {
  try {
    const result = await domainService.register(req.user.id, req.project.id, (req.body || {}).hostname);
    res.status(201).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

router.post('/projects/:id/domains/:domainId/verify', requireProjectAccess, async (req, res, next) => {
  try {
    const domain = await domainService.verify(req.user.id, req.project.id, req.params.domainId);
    res.status(200).json({ domain, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

router.delete('/projects/:id/domains/:domainId', requireProjectAccess, async (req, res, next) => {
  try {
    const result = await domainService.remove(req.user.id, req.project.id, req.params.domainId);
    res.status(200).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
});

module.exports = router;
