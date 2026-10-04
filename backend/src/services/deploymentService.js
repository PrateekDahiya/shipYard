'use strict';

const deploymentRepo = require('../repositories/deploymentRepo');
const projectRepo = require('../repositories/projectRepo');
const auditRepo = require('../repositories/auditRepo');
const queue = require('../queues/deploymentQueue');
const githubService = require('./githubService');
const { getPool } = require('../config/db');

async function resolveCommitSha({ project, source }) {
  if (source && source.commitSha) {
    return { sha: source.commitSha, message: source.commitMessage || null, author: source.commitAuthor || null };
  }
  if (source && source.previousDeploymentId) {
    const prev = await deploymentRepo.getById(source.previousDeploymentId);
    if (!prev || prev.project_id !== project.id) {
      const err = new Error('invalid_previous_deployment');
      err.status = 400;
      throw err;
    }
    return { sha: prev.commit_sha, message: prev.commit_message, author: prev.commit_author };
  }
  // Branch latest: prefer the GitHub API when the repo is linked (gives
  // message/author); otherwise resolve via git ls-remote (public repos need
  // no token, private ones use the linked token when available).
  const [links] = await getPool().query('SELECT * FROM repositories WHERE project_id = ? LIMIT 1', [project.id]);
  const token = await githubService.getTokenForUser(project.owner_id);
  const branch = (source && source.branch) || project.branch || (links[0] && links[0].default_branch) || 'main';
  if (links.length > 0 && token) {
    const [owner, repo] = links[0].full_name.split('/');
    const commits = await githubService.githubApi(token, `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`);
    if (!commits.length) {
      const err = new Error('no_commits_found');
      err.status = 400;
      throw err;
    }
    return { sha: commits[0].sha, message: commits[0].commit.message, author: commits[0].commit.author && commits[0].commit.author.name, branch };
  }
  const { lsRemote, withToken } = require('../utils/git');
  const sha = await lsRemote(withToken(project.repository_url, token), branch);
  return { sha, message: null, author: null, branch };
}

async function createDeployment(userId, projectId, source) {
  const project = await projectRepo.getById(projectId);
  if (!project) {
    const err = new Error('project_not_found');
    err.status = 404;
    throw err;
  }
  if (!project.repository_url) {
    const err = new Error('no_repository_linked');
    err.status = 400;
    throw err;
  }
  const commit = await resolveCommitSha({ project, source });
  const deployment = await deploymentRepo.create({
    projectId,
    commitSha: commit.sha,
    branch: commit.branch || (source && source.branch) || project.branch || 'main',
    commitMessage: commit.message,
    commitAuthor: commit.author,
    triggeredBy: userId,
    triggerType: (source && source.triggerType) || 'manual',
    buildCommand: project.build_command,
    runCommand: project.run_command,
    appPort: project.app_port,
  });
  const q = await queue.enqueue(deployment.id, projectId);
  await auditRepo.record({ userId, projectId, action: 'deployment.created', metadata: { deploymentId: deployment.id, queued: q.queued } });
  return { deployment, queued: q.queued };
}

async function cancelDeployment(userId, deploymentId) {
  const current = await deploymentRepo.getById(deploymentId);
  if (!current) {
    const err = new Error('deployment_not_found');
    err.status = 404;
    throw err;
  }
  const updated = await deploymentRepo.transition(deploymentId, 'CANCELLED', 'cancelled by user');
  await auditRepo.record({ userId, projectId: current.project_id, action: 'deployment.cancelled', metadata: { deploymentId } });
  return updated;
}

// Rollback never mutates history: it creates a NEW deployment whose source
// commit is the rolled-back deployment's commit.
async function rollbackTo(userId, projectId, sourceDeploymentId) {
  const source = await deploymentRepo.getById(sourceDeploymentId);
  if (!source || String(source.project_id) !== String(projectId)) {
    const err = new Error('deployment_not_found');
    err.status = 404;
    throw err;
  }
  const project = await projectRepo.getById(projectId);
  const deployment = await deploymentRepo.create({
    projectId,
    commitSha: source.commit_sha,
    branch: source.branch,
    commitMessage: source.commit_message,
    commitAuthor: source.commit_author,
    triggeredBy: userId,
    triggerType: 'rollback',
    buildCommand: project.build_command,
    runCommand: project.run_command,
    appPort: project.app_port,
    rollbackOf: source.id,
  });
  const q = await queue.enqueue(deployment.id, projectId);
  await auditRepo.record({ userId, projectId, action: 'deployment.rollback', metadata: { deploymentId: deployment.id, sourceId: source.id } });
  return { deployment, queued: q.queued };
}

module.exports = { createDeployment, cancelDeployment, rollbackTo, resolveCommitSha };
