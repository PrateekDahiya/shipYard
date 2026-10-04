'use strict';

// Minimal git helpers for commit resolution (no clone needed).
// ls-remote works against remote URLs AND local paths, public or private
// (token embedded when available — same approach as the pipeline clone).

const { spawn } = require('child_process');

function withToken(repoUrl, token) {
  if (token && repoUrl.startsWith('https://')) {
    return repoUrl.replace('https://', `https://x-access-token:${token}@`);
  }
  return repoUrl;
}

function lsRemote(repoUrl, branch, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['ls-remote', repoUrl, branch || 'main'], { timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', () => {
      const err = new Error('cannot_resolve_branch');
      err.status = 400;
      reject(err);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const err = new Error('cannot_resolve_branch');
        err.status = 400;
        err.detail = stderr.slice(-500);
        reject(err);
        return;
      }
      const first = stdout.split('\n')[0] || '';
      const sha = first.split('\t')[0].trim();
      if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
        const err = new Error('cannot_resolve_branch');
        err.status = 400;
        reject(err);
        return;
      }
      resolve(sha);
    });
  });
}

module.exports = { withToken, lsRemote };
