'use strict';

const express = require('express');
const controller = require('../controllers/auth');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', auth, controller.me);

module.exports = router;
