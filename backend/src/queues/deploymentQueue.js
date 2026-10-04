'use strict';

// Redis-list deployment queue. API side only enqueues; the worker blocks on
// BRPOP. Payload is validated on both ends. When Redis is unreachable the
// deployment stays QUEUED in MySQL and enqueue() reports queued:false so the
// API never fails the request (worker picks it up via resync).

const { getRedis } = require('../config/redis');

const QUEUE_KEY = 'shipyard:deployments:queue';
const PROCESSING_KEY = 'shipyard:deployments:processing';

function validatePayload(p) {
  return p && Number.isInteger(p.deploymentId) && Number.isInteger(p.projectId);
}

async function enqueue(deploymentId, projectId) {
  const payload = { deploymentId, projectId, enqueuedAt: new Date().toISOString() };
  try {
    await getRedis().lpush(QUEUE_KEY, JSON.stringify(payload));
    return { queued: true };
  } catch {
    return { queued: false, reason: 'redis_unavailable' };
  }
}

async function queueDepth() {
  try {
    return await getRedis().llen(QUEUE_KEY);
  } catch {
    return -1;
  }
}

module.exports = { QUEUE_KEY, PROCESSING_KEY, validatePayload, enqueue, queueDepth };
