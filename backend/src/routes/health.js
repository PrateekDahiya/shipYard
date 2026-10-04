'use strict';

const express = require('express');
const { health, ready } = require('../controllers/health');

const router = express.Router();

router.get('/health', health);
router.get('/ready', ready);

module.exports = router;
