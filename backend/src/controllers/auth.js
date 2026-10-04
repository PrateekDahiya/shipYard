'use strict';

const authService = require('../services/authService');
const userRepo = require('../repositories/userRepo');
const log = require('../utils/logger');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body || {});
    log.info('auth_register', { requestId: req.id, userId: result.user.id });
    res.status(201).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      log.warn('auth_register_rejected', { requestId: req.id, reason: e.message });
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    return next(e);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body || {});
    log.info('auth_login', { requestId: req.id, userId: result.user.id });
    res.status(200).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      log.warn('auth_login_rejected', { requestId: req.id, reason: e.message });
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    return next(e);
  }
}

async function me(req, res, next) {
  try {
    const user = await userRepo.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', requestId: req.id });
    }
    res.status(200).json({ user, requestId: req.id });
  } catch (e) {
    return next(e);
  }
}

async function logout(req, res) {
  // Stateless JWT: logout is client-side token discard. Endpoint exists for
  // API symmetry and future denylist support.
  res.status(200).json({ ok: true, requestId: req.id });
}

module.exports = { register, login, me, logout };
