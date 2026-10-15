'use strict';

const express = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/workspaces');

const router = express.Router();
router.use(auth);
router.get('/', controller.list);
router.post('/', controller.create);
module.exports = router;
