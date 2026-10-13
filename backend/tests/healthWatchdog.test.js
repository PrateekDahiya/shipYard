'use strict';

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { checkOnce, watchdogDelays, failureThreshold } = require('../src/services/healthWatchdog');

function poolFor(rows, updates = []) {
  return {
    query: jest.fn(async (sql, params) => {
      if (String(sql).startsWith('SELECT i.id')) return [rows];
      updates.push({ sql: String(sql), params });
      return [[]];
    }),
  };
}

function dependencies(result) {
  return {
    docker: { containerIp: jest.fn().mockResolvedValue('172.20.0.12') },
    health: { probeOnce: jest.fn().mockResolvedValue(result) },
  };
}

const row = { instance_id: 4, container_id: 'container-4', state: 'RUNNING', deployment_id: 8, dep_port: 3000, project_port: 3000, healthcheck_path: '/health', deploy_type: 'server' };

afterEach(() => {
  delete process.env.HEALTH_WATCHDOG_MIN_MS;
  delete process.env.HEALTH_WATCHDOG_MAX_MS;
  delete process.env.HEALTH_WATCHDOG_FAILS;
});

test('watchdog delay defaults to a random 5-10 second window', () => {
  expect(watchdogDelays()).toEqual({ min: 5000, max: 10000 });
});

test('watchdog uses configured failure threshold', () => {
  process.env.HEALTH_WATCHDOG_FAILS = '2';
  expect(failureThreshold()).toBe(2);
});

test('watchdog marks a running instance unhealthy after consecutive failures', async () => {
  const updates = [];
  const pool = poolFor([row], updates);
  const deps = dependencies({ ok: false, status: 503 });
  const fails = new Map();

  await checkOnce({ pool, ...deps, fails });
  await checkOnce({ pool, ...deps, fails });
  expect(updates.some((x) => x.sql.includes("state = 'UNHEALTHY'"))).toBe(false);

  await checkOnce({ pool, ...deps, fails });
  expect(updates.some((x) => x.sql.includes("state = 'UNHEALTHY'"))).toBe(true);
  expect(fails.get(4)).toBe(3);
});

test('watchdog marks an unhealthy instance running after recovery', async () => {
  const unhealthy = { ...row, state: 'UNHEALTHY' };
  const updates = [];
  const pool = poolFor([unhealthy], updates);
  const deps = dependencies({ ok: true, status: 200 });
  const fails = new Map([[4, 3]]);

  const result = await checkOnce({ pool, ...deps, fails });
  expect(result.recovered).toBe(1);
  expect(updates.some((x) => x.sql.includes("state = 'RUNNING'"))).toBe(true);
  expect(fails.has(4)).toBe(false);
});
