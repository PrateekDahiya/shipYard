'use strict';

const projectService = require('../services/projectService');
const log = require('../utils/logger');

async function list(req, res, next) {
  try {
    const projects = await projectService.list(req.user.id);
    res.status(200).json({ projects, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const project = await projectService.create(req.user.id, req.body || {});
    log.info('project_created', { requestId: req.id, userId: req.user.id, projectId: project.id, name: project.name });
    res.status(201).json({ project, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
}

async function get(req, res, next) {
  try {
    const { getById } = require('../repositories/projectRepo');
    const project = await getById(req.project.id);
    res.status(200).json({ project, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function patch(req, res, next) {
  try {
    const project = await projectService.update(req.user.id, req.project.id, req.body || {});
    log.info('project_updated', { requestId: req.id, userId: req.user.id, projectId: project.id });
    res.status(200).json({ project, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    await projectService.remove(req.user.id, req.project.id);
    log.info('project_deleted', { requestId: req.id, userId: req.user.id, projectId: req.project.id });
    res.status(200).json({ ok: true, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, create, get, patch, remove };
