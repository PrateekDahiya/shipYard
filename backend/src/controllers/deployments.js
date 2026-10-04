'use strict';

const deploymentRepo = require('../repositories/deploymentRepo');
const deploymentService = require('../services/deploymentService');
const log = require('../utils/logger');

async function create(req, res, next) {
  try {
    const result = await deploymentService.createDeployment(req.user.id, req.project.id, req.body || {});
    log.info('deployment_created', {
      requestId: req.id,
      userId: req.user.id,
      projectId: req.project.id,
      deploymentId: result.deployment.id,
      trigger: result.deployment.trigger_type,
      queued: result.queued,
    });
    res.status(201).json({ ...result, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
}

async function list(req, res, next) {
  try {
    const deployments = await deploymentRepo.listForProject(req.project.id);
    res.status(200).json({ deployments, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function get(req, res, next) {
  try {
    const deployment = await deploymentRepo.getById(req.params.depId);
    if (!deployment || String(deployment.project_id) !== String(req.project.id)) {
      return res.status(404).json({ error: 'deployment_not_found', requestId: req.id });
    }
    // Direct dev URL: the ephemeral host port only exists while the instance
    // runs locally. The Traefik live_url is the prod-routing equivalent.
    let directUrl = null;
    try {
      const { getPool } = require('../config/db');
      const [rows] = await getPool().query(
        "SELECT host_port FROM application_instances WHERE deployment_id = ? AND state = 'RUNNING' ORDER BY id DESC LIMIT 1",
        [deployment.id]
      );
      if (rows.length && rows[0].host_port) {
        directUrl = `http://localhost:${rows[0].host_port}`;
      }
    } catch {
      /* direct URL is best-effort */
    }
    res.status(200).json({ deployment: { ...deployment, direct_url: directUrl }, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function logs(req, res, next) {
  try {
    const deployment = await deploymentRepo.getById(req.params.depId);
    if (!deployment || String(deployment.project_id) !== String(req.project.id)) {
      return res.status(404).json({ error: 'deployment_not_found', requestId: req.id });
    }
    const logs = await deploymentRepo.logsFor(req.params.depId);
    res.status(200).json({ logs, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function events(req, res, next) {
  try {
    const deployment = await deploymentRepo.getById(req.params.depId);
    if (!deployment || String(deployment.project_id) !== String(req.project.id)) {
      return res.status(404).json({ error: 'deployment_not_found', requestId: req.id });
    }
    const events = await deploymentRepo.eventsFor(req.params.depId);
    res.status(200).json({ events, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function cancel(req, res, next) {
  try {
    const deployment = await deploymentRepo.getById(req.params.depId);
    if (!deployment || String(deployment.project_id) !== String(req.project.id)) {
      return res.status(404).json({ error: 'deployment_not_found', requestId: req.id });
    }
    const updated = await deploymentService.cancelDeployment(req.user.id, req.params.depId);
    log.info('deployment_cancelled', { requestId: req.id, userId: req.user.id, projectId: req.project.id, deploymentId: updated.id });
    res.status(200).json({ deployment: updated, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    next(e);
  }
}

module.exports = { create, list, get, logs, events, cancel };
