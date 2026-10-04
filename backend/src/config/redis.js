'use strict';

const Redis = require('ioredis');
const config = require('./index');

let client = null;

function getRedis() {
  if (!client) {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
  }
  return client;
}

async function pingRedis() {
  const r = getRedis();
  const res = await r.ping();
  return res === 'PONG';
}

async function closeRedis() {
  if (client) {
    client.disconnect();
    client = null;
  }
}

module.exports = { getRedis, pingRedis, closeRedis };
