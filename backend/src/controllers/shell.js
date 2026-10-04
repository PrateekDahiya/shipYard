'use strict';

const shellService = require('../services/shellService');
const log = require('../utils/logger');

async function open(req, res, next) {
  try {
    const session = await shellService.openSession(req.user.id, req.project.id);
    log.info('shell_opened', { requestId: req.id, userId: req.user.id, projectId: req.project.id, sessionId: session.id });
    res.status(201).json({
      session: { id: session.id, container_id: session.container_id, started_at: session.started_at },
      attachUrl: `/api/projects/${req.project.id}/shell/${session.id}/attach`,
      requestId: req.id,
    });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
}

async function close(req, res, next) {
  try {
    const session = await shellService.getSession(req.params.sessionId);
    if (!session || String(session.project_id) !== String(req.project.id)) {
      return res.status(404).json({ error: 'session_not_found', requestId: req.id });
    }
    if (String(session.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'forbidden', requestId: req.id });
    }
    const updated = await shellService.closeSession(session.id);
    log.info('shell_closed', { requestId: req.id, userId: req.user.id, projectId: req.project.id, sessionId: session.id });
    res.status(200).json({ session: updated, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { open, close };
