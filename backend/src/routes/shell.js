'use strict';

const express = require('express');
const controller = require('../controllers/shell');
const auth = require('../middleware/auth');
const requireProjectAccess = require('../middleware/requireProjectAccess');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.use(auth);
router.use('/projects/:id', rateLimit);
router.post('/projects/:id/shell', requireProjectAccess, controller.open);
router.delete('/projects/:id/shell/:sessionId', requireProjectAccess, controller.close);

module.exports = router;
