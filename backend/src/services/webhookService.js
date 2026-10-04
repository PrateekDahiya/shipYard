'use strict';

// GitHub webhook auto-deploy (M11). HMAC-verified, project-resolved,
// deduplicated: a push for a commit that already has a live (non-terminal)
// deployment does not create another one.

const crypto = require('crypto');
const { getPool } = require('../config/db');
const deploymentService = require('./deploymentService');

const NON_TERMINAL = ['QUEUED', 'CLONING', 'BUILDING', 'IMAGE_CREATED', 'STARTING', 'HEALTH_CHECKING', 'RUNNING'];

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

async function findRepository(githubRepoId) {
  const [rows] = await getPool().query('SELECT * FROM repositories WHERE github_repo_id = ? LIMIT 1', [githubRepoId]);
  return rows[0] || null;
}

async function findLiveDeployment(projectId, sha) {
  const [rows] = await getPool().query(
    `SELECT * FROM deployments WHERE project_id = ? AND commit_sha = ? AND status IN (${NON_TERMINAL.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1`,
    [projectId, sha, ...NON_TERMINAL]
  );
  return rows[0] || null;
}

async function handlePush({ rawBody, signature }) {
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    const err = new Error('invalid_payload');
    err.status = 400;
    throw err;
  }
  const githubRepoId = payload.repository && payload.repository.id;
  const sha = payload.after || (payload.head_commit && payload.head_commit.id);
  if (!githubRepoId || !sha) {
    const err = new Error('invalid_payload');
    err.status = 400;
    throw err;
  }
  const link = await findRepository(githubRepoId);
  if (!link) {
    return { ignored: true, reason: 'unknown_repository' };
  }
  if (!verifySignature(rawBody, signature, link.webhook_secret)) {
    const err = new Error('invalid_signature');
    err.status = 401;
    throw err;
  }
  const [projects] = await getPool().query('SELECT * FROM projects WHERE id = ? LIMIT 1', [link.project_id]);
  const project = projects[0];
  if (!project) {
    return { ignored: true, reason: 'unknown_project' };
  }
  const branch = (payload.ref || '').replace('refs/heads/', '') || project.branch;
  if (branch !== project.branch) {
    return { ignored: true, reason: 'branch_not_tracked', branch };
  }
  if (!project.auto_deploy) {
    return { skipped: true, reason: 'auto_deploy_disabled' };
  }
  // Serialize concurrent deliveries of the same commit: without this, two
  // simultaneous pushes could both pass the dedupe check and double-deploy.
  const lockName = `shipyard:webhook:${project.id}:${sha}`.slice(0, 64);
  const [[lockRow]] = await getPool().query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (!lockRow || lockRow.acquired !== 1) {
    const err = new Error('webhook_busy_retry');
    err.status = 409;
    throw err;
  }
  try {
    const existing = await findLiveDeployment(project.id, sha);
    if (existing) {
      return { duplicate: true, deployment: existing };
    }
    const head = payload.head_commit || {};
    const { deployment, queued } = await deploymentService.createDeployment(null, project.id, {
      commitSha: sha,
      branch,
      commitMessage: head.message || null,
      commitAuthor: (head.author && (head.author.username || head.author.name)) || null,
      triggerType: 'webhook',
    });
    return { deployment, queued };
  } finally {
    await getPool().query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
  }
}

module.exports = { verifySignature, handlePush, findLiveDeployment, NON_TERMINAL };
