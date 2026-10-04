'use strict';

// Structured JSON logging (S-003).
// Every line: { ts, level, msg, ...fields }. Correlation: HTTP paths carry
// `requestId` (+ userId/projectId when known); pipeline/worker paths carry
// `deploymentId` (+ projectId). No secrets, tokens, or env values — ever.
// Level via LOG_LEVEL=debug|info|warn|error (default info).

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

function currentLevel() {
  const name = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[name] !== undefined ? LEVELS[name] : LEVELS.info;
}

function logger(level, msg, fields) {
  if (LEVELS[level] < currentLevel()) {
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields || {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  debug: (msg, fields) => logger('debug', msg, fields),
  info: (msg, fields) => logger('info', msg, fields),
  warn: (msg, fields) => logger('warn', msg, fields),
  error: (msg, fields) => logger('error', msg, fields),
};
