'use strict';

// HTTP health probing with timeout, retries and intervals.

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function probeOnce(url, { timeoutMs, expectedStatus }) {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    return { ok: res.status === expectedStatus, status: res.status, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: e.message };
  }
}

async function waitHealthy(url, { timeoutMs = 5000, expectedStatus = 200, retries = 12, intervalMs = 5000, onAttempt } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    last = await probeOnce(url, { timeoutMs, expectedStatus });
    if (onAttempt) {
      await onAttempt(attempt, last);
    }
    if (last.ok) {
      return { healthy: true, attempts: attempt, last };
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return { healthy: false, attempts: retries, last };
}

module.exports = { probeOnce, waitHealthy };
