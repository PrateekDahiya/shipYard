'use strict';

const express = require('express');
const controller = require('../controllers/webhooks');

const router = express.Router();

router.post('/', controller.receive);

module.exports = router;
