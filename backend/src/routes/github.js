'use strict';

const express = require('express');
const controller = require('../controllers/github');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);
router.get('/status', controller.status);
router.get('/auth-url', controller.authUrl);
router.post('/oauth/callback', controller.callback);
router.get('/repos', controller.repos);
router.get('/repos/:owner/:repo/branches', controller.branches);
router.get('/repos/:owner/:repo/commits', controller.commits);

module.exports = router;
