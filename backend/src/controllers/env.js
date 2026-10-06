'use strict';

const envRepo = require('../repositories/envRepo');
const auditRepo = require('../repositories/auditRepo');

async function list(req, res, next) {
  try {
    const { includeSecretValues } = req.query;
    const variables = await envRepo.list(req.project.id, { includeSecretValues: includeSecretValues !== 'false' });
    res.status(200).json({ variables, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function upsert(req, res, next) {
  try {
    const { key, value, is_secret: isSecret, scope } = req.body || {};
    const variable = await envRepo.upsert(req.project.id, { key, value, isSecret: isSecret !== false, scope: scope || 'both' });
    await auditRepo.record({
      userId: req.user.id,
      projectId: req.project.id,
      action: 'environment.updated',
      metadata: { key, scope: scope || 'both' },
    });
    res.status(200).json({ variable, requestId: req.id });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, requestId: req.id });
    }
    if (e.message && e.message.includes('DB_ENV_KEY')) {
      return res.status(500).json({ error: 'invalid_db_env_key', requestId: req.id });
    }
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    const ok = await envRepo.remove(req.project.id, req.params.key);
    if (!ok) {
      return res.status(404).json({ error: 'env_not_found', requestId: req.id });
    }
    await auditRepo.record({
      userId: req.user.id,
      projectId: req.project.id,
      action: 'environment.updated',
      metadata: { key: req.params.key, deleted: true },
    });
    res.status(200).json({ ok: true, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, upsert, remove };
