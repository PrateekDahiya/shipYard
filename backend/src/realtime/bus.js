'use strict';

// Project-scoped event bus for realtime dashboard updates.
// Event: { type, projectId, deploymentId?, data?, at }
//
// Delivery is twofold:
//   1. In-process fan-out to local subscribers (zero-dependency fast path,
//      keeps working when Redis is unreachable).
//   2. Redis pub/sub bridge so events published by the worker process reach
//      SSE subscribers in the API process (separate containers/processes in
//      the compose topology — a pure in-memory bus can never cross that
//      boundary, which previously left live tails permanently empty).
//
// Both paths are best-effort and failure-isolated: a broken Redis or a
// throwing listener must never break the deployment pipeline.

function channel(projectId) {
  return `project:${projectId}`;
}

function isValid(event) {
  return !!event && !!event.projectId && !!event.type;
}

// channel -> Set<listener>
const listeners = new Map();

let pubClient = null;
let subClient = null;

function redisOptions() {
  const config = require('../config');
  return {
    host: (config.redis && config.redis.host) || process.env.REDIS_HOST || 'localhost',
    port: (config.redis && config.redis.port) || parseInt(process.env.REDIS_PORT || '6379', 10),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  };
}

function getPubClient() {
  if (!pubClient) {
    const Redis = require('ioredis');
    pubClient = new Redis({ ...redisOptions(), retryStrategy: () => null });
    pubClient.on('error', () => {});
  }
  return pubClient;
}

function getSubClient() {
  if (!subClient) {
    const Redis = require('ioredis');
    subClient = new Redis({ ...redisOptions(), retryStrategy: (times) => Math.min(times * 200, 5000) });
    subClient.on('error', () => {});
    subClient.on('message', (ch, message) => {
      const set = listeners.get(ch);
      if (!set || set.size === 0) {
        return;
      }
      let evt = null;
      try {
        evt = JSON.parse(message);
      } catch {
        return;
      }
      if (!isValid(evt)) {
        return;
      }
      for (const fn of [...set]) {
        try {
          fn(evt);
        } catch {
          /* one bad listener must not kill fan-out */
        }
      }
    });
    // Re-subscribe after reconnects: queued subscribe() calls fail fast
    // while offline (enableOfflineQueue: false), so restore them on ready.
    subClient.on('ready', () => {
      for (const ch of listeners.keys()) {
        try {
          const r = subClient.subscribe(ch);
          if (r && typeof r.catch === 'function') {
            r.catch(() => {});
          }
        } catch {
          /* retried on next ready */
        }
      }
    });
  }
  return subClient;
}

function bridgePublish(ch, stamped) {
  try {
    const r = getPubClient().publish(ch, JSON.stringify(stamped));
    if (r && typeof r.catch === 'function') {
      r.catch(() => {});
    }
  } catch {
    /* redis unavailable — local delivery already done */
  }
}

function publish(event) {
  if (!isValid(event)) {
    return;
  }
  const stamped = { ...event, at: new Date().toISOString() };
  const set = listeners.get(channel(event.projectId));
  if (set) {
    for (const fn of [...set]) {
      try {
        fn(stamped);
      } catch {
        /* one bad listener must not break the pipeline */
      }
    }
  }
  bridgePublish(channel(event.projectId), stamped);
}

function subscribe(projectId, listener) {
  const ch = channel(projectId);
  let set = listeners.get(ch);
  if (!set) {
    set = new Set();
    listeners.set(ch, set);
  }
  set.add(listener);
  // Best-effort Redis subscription; failure leaves local-only delivery.
  try {
    const r = getSubClient().subscribe(ch);
    if (r && typeof r.catch === 'function') {
      r.catch(() => {});
    }
  } catch {
    /* redis unavailable — local delivery still works */
  }
  return () => {
    const current = listeners.get(ch);
    if (current) {
      current.delete(listener);
      if (current.size === 0) {
        listeners.delete(ch);
        try {
          if (subClient) {
            const u = subClient.unsubscribe(ch);
            if (u && typeof u.catch === 'function') {
              u.catch(() => {});
            }
          }
        } catch {
          /* noop */
        }
      }
    }
  };
}

async function closeBridge() {
  const jobs = [];
  if (subClient) {
    try {
      const r = subClient.disconnect();
      if (r && typeof r.then === 'function') {
        jobs.push(r.catch(() => {}));
      }
    } catch {
      /* noop */
    }
    subClient = null;
  }
  if (pubClient) {
    try {
      const r = pubClient.disconnect();
      if (r && typeof r.then === 'function') {
        jobs.push(r.catch(() => {}));
      }
    } catch {
      /* noop */
    }
    pubClient = null;
  }
  listeners.clear();
  await Promise.all(jobs);
}

module.exports = { publish, subscribe, closeBridge };
