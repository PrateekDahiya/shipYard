'use strict';

// ShipYard deployment worker (Phase 02): blocks on the Redis queue and runs
// the deployment pipeline from backend/src/workers/deploymentWorker.js.
// Requires Redis; requires a Docker daemon for real container builds.

const path = require('path');

const BACKEND = path.join(__dirname, '..', '..', 'backend');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', '..', '.env') });
require(path.join(BACKEND, 'node_modules', 'dotenv')).config();

const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'worker redis error', error: err.message }));
});

const QUEUE_KEY = 'shipyard:deployments:queue';
const PROCESSING_KEY = 'shipyard:deployments:processing';

async function main() {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'shipyard deployment worker started (Phase 02)' }));
  const { runDeployment } = require(path.join(BACKEND, 'src', 'workers', 'deploymentWorker.js'));
  for (;;) {
    let raw = null;
    try {
      const res = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, 5);
      raw = res;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!raw) {
      continue;
    }
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      await redis.lrem(PROCESSING_KEY, 1, raw);
      continue;
    }
    if (payload && Number.isInteger(payload.deploymentId)) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'worker_pickup', deploymentId: payload.deploymentId, projectId: payload.projectId || null }));
    } else {
      await redis.lrem(PROCESSING_KEY, 1, raw);
      continue;
    }
    try {
      const final = await runDeployment(payload.deploymentId);
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'worker_pickup_finished', deploymentId: payload.deploymentId, projectId: payload.projectId || null, status: final && final.status }));
    } catch (e) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'deployment error', deploymentId: payload.deploymentId, error: e.message }));
    } finally {
      await redis.lrem(PROCESSING_KEY, 1, raw);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
