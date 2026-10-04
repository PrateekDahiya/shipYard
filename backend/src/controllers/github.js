'use strict';

const githubService = require('../services/githubService');
const { getPool } = require('../config/db');

function sendErr(res, req, e) {
  return res.status(e.status || 500).json({ error: e.message || 'internal_error', requestId: req.id });
}

async function status(req, res, next) {
  try {
    const [rows] = await getPool().query('SELECT login, github_user_id, created_at FROM github_accounts WHERE user_id = ? LIMIT 1', [
      req.user.id,
    ]);
    res.status(200).json({ linked: rows.length > 0, account: rows[0] || null, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function authUrl(req, res) {
  try {
    const url = githubService.authUrl(String(req.user.id));
    res.status(200).json({ url, requestId: req.id });
  } catch (e) {
    sendErr(res, req, e);
  }
}

async function callback(req, res) {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: 'missing_code', requestId: req.id });
    }
    const token = await githubService.exchangeCode(code);
    const account = await githubService.linkAccount(req.user.id, token);
    res.status(200).json({ account, requestId: req.id });
  } catch (e) {
    sendErr(res, req, e);
  }
}

async function repos(req, res) {
  try {
    const token = await githubService.getTokenForUser(req.user.id);
    if (!token) {
      return res.status(409).json({ error: 'github_not_linked', requestId: req.id });
    }
    const data = await githubService.githubApi(token, '/user/repos?per_page=100&sort=updated');
    res.status(200).json({
      repos: data.map((r) => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch, private: r.private })),
      requestId: req.id,
    });
  } catch (e) {
    sendErr(res, req, e);
  }
}

async function branches(req, res) {
  try {
    const token = await githubService.getTokenForUser(req.user.id);
    if (!token) {
      return res.status(409).json({ error: 'github_not_linked', requestId: req.id });
    }
    const { owner, repo } = req.params;
    const data = await githubService.githubApi(token, `/repos/${owner}/${repo}/branches?per_page=100`);
    res.status(200).json({ branches: data.map((b) => ({ name: b.name })), requestId: req.id });
  } catch (e) {
    sendErr(res, req, e);
  }
}

async function commits(req, res) {
  try {
    const token = await githubService.getTokenForUser(req.user.id);
    if (!token) {
      return res.status(409).json({ error: 'github_not_linked', requestId: req.id });
    }
    const { owner, repo } = req.params;
    const sha = req.query.sha ? `?sha=${encodeURIComponent(req.query.sha)}&per_page=30` : '?per_page=30';
    const data = await githubService.githubApi(token, `/repos/${owner}/${repo}/commits${sha}`);
    res.status(200).json({
      commits: data.map((c) => ({ sha: c.sha, message: c.commit.message, author: c.commit.author && c.commit.author.name })),
      requestId: req.id,
    });
  } catch (e) {
    sendErr(res, req, e);
  }
}

async function link(req, res) {
  try {
    const repository = await githubService.linkRepository(req.user.id, req.project.id, req.body || {});
    res.status(200).json({ repository, requestId: req.id });
  } catch (e) {
    sendErr(res, req, e);
  }
}

module.exports = { status, authUrl, callback, repos, branches, commits, link };
