'use strict';

// Unit tests for runtimeStatsService degradation behavior.
// Fully mocked (no MySQL/Redis/Docker needed): the /runtime endpoint must
// never 500 on Docker-side failures — it degrades to { running: false }.

jest.mock('../src/config/db', () => ({ getPool: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getPool } = require('../src/config/db');
const log = require('../src/utils/logger');
const { runtimeStats } = require('../src/services/runtimeStatsService');

function mockRows(rows) {
  getPool.mockReturnValue({ query: jest.fn().mockResolvedValue([rows]) });
}

function mockQueryRejected(err) {
  getPool.mockReturnValue({ query: jest.fn().mockRejectedValue(err) });
}

function fakeDocker({ inspectImpl, statsImpl } = {}) {
  return {
    getContainer: jest.fn(() => ({
      inspect: jest.fn().mockImplementation(inspectImpl || (async () => ({ SizeRw: 10, SizeRootFs: 20, State: { StartedAt: '2026-01-01T00:00:00Z' } }))),
      stats: jest.fn().mockImplementation(statsImpl || (async () => ({
        cpu_stats: { cpu_usage: { total_usage: 200, percpu_usage: [100, 100] }, system_cpu_usage: 200, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 100 },
        memory_stats: { usage: 512, limit: 1024 },
        networks: { eth0: { rx_bytes: 7, tx_bytes: 9 } },
      }))),
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('no RUNNING row -> not running without touching docker', async () => {
  mockRows([]);
  const docker = fakeDocker();
  const r = await runtimeStats(512, docker);
  expect(r).toEqual({ running: false });
  expect(docker.getContainer).not.toHaveBeenCalled();
});

test('daemon unreachable (ECONNREFUSED, no statusCode) -> not running, not throw', async () => {
  mockRows([{ container_id: 'dead-beef', deployment_id: 759 }]);
  const refused = new Error('connect ECONNREFUSED /var/run/docker.sock');
  refused.code = 'ECONNREFUSED';
  const docker = fakeDocker({ inspectImpl: async () => { throw refused; } });
  const r = await runtimeStats(512, docker);
  expect(r).toEqual({ running: false });
  expect(log.warn).toHaveBeenCalledWith('runtime_stats_unavailable', expect.objectContaining({ projectId: 512, containerId: 'dead-beef' }));
});

test('container gone (daemon 404) -> not running, not throw', async () => {
  mockRows([{ container_id: 'gone', deployment_id: 755 }]);
  const gone = new Error('no such container');
  gone.statusCode = 404;
  const docker = fakeDocker({ inspectImpl: async () => { throw gone; } });
  const r = await runtimeStats(512, docker);
  expect(r).toEqual({ running: false });
});

test('happy path -> running stats', async () => {
  mockRows([{ container_id: 'abc123', deployment_id: 755 }]);
  const r = await runtimeStats(512, fakeDocker());
  expect(r.running).toBe(true);
  expect(r.containerId).toBe('abc123');
  expect(r.deploymentId).toBe(755);
  expect(r.cpuPercent).toBe(200);
  expect(r.memoryBytes).toBe(512);
  expect(r.netRxBytes).toBe(7);
  expect(r.netTxBytes).toBe(9);
});

test('DB failure still propagates (real 500-worthy error)', async () => {
  mockQueryRejected(new Error('ER_NO_SUCH_TABLE'));
  await expect(runtimeStats(512, fakeDocker())).rejects.toThrow('ER_NO_SUCH_TABLE');
});
