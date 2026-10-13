'use strict';

// Unit tests for tunnelService (no MySQL/Docker/Redis needed).
// Docker + DB are faked; behavior under fake-docker failures matters most:
// tunnels must never break deployments.

jest.mock('../src/config/db', () => ({ getPool: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

let tunnelService;
let queryMock;

function mockDb() {
  // NOTE: must require fresh post-resetModules — a top-level binding would be
  // the pre-reset mock instance that the service no longer sees.
  // setPublicUrl: UPDATE ok, then getById SELECT returns one row.
  const { getPool: fresh } = require('../src/config/db');
  queryMock = jest.fn().mockResolvedValueOnce([[]]).mockResolvedValue([[{ id: 9 }]]);
  fresh.mockReturnValue({ query: queryMock });
}

function fakeDocker(overrides = {}) {
  return {
    tunnelName: jest.fn((pid, dep) => `shipyard-p${pid}-d${dep}-tunnel`),
    pullImage: jest.fn().mockResolvedValue([]),
    containerIp: jest.fn().mockResolvedValue('172.17.0.5'),
    removeContainersByNamePrefix: jest.fn().mockResolvedValue(1),
    startContainer: jest.fn().mockResolvedValue({ id: 'sidecar1' }),
    containerLogsText: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    listLabeled: jest.fn().mockResolvedValue([]),
    getContainer: jest.fn(() => ({ stop: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue({}) })),
    ...overrides,
  };
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...OLD_ENV, CLOUDFLARE_ENABLED: 'true', TUNNEL_DISCOVERY_TIMEOUT_MS: '200', TUNNEL_DISCOVERY_POLL_MS: '10' };
  tunnelService = require('../src/services/tunnelService');
  mockDb();
});

afterEach(() => {
  process.env = OLD_ENV;
});

test('disabled via env -> null without touching docker', async () => {
  process.env.CLOUDFLARE_ENABLED = 'false';
  const docker = fakeDocker();
  const r = await tunnelService.ensureDeploymentTunnel({ projectId: 1, deploymentId: 2, containerId: 'abc', appPort: 3000, docker });
  expect(r).toBeNull();
  expect(docker.pullImage).not.toHaveBeenCalled();
  expect(docker.startContainer).not.toHaveBeenCalled();
});

test('happy path starts sidecar on container IP and persists discovered URL', async () => {
  const docker = fakeDocker({
    containerLogsText: jest.fn().mockResolvedValue({ stdout: 'blabla https://worthy-emu-42.trycloudflare.com more\n', stderr: '' }),
  });
  const url = await tunnelService.ensureDeploymentTunnel({ projectId: 1, deploymentId: 2, containerId: 'abc123', appPort: 3001, docker });
  expect(url).toBe('https://worthy-emu-42.trycloudflare.com');
  // Upstream is the container IP:port — never localhost or a host-mapped port.
  expect(docker.startContainer).toHaveBeenCalledWith(expect.objectContaining({
    name: 'shipyard-p1-d2-tunnel',
    image: expect.stringContaining('cloudflared'),
    cmd: ['tunnel', '--url', 'http://172.17.0.5:3001', '--no-autoupdate'],
  }));
  const [[sql, params]] = queryMock.mock.calls.filter(([q]) => String(q).startsWith('UPDATE deployments SET public_url'));
  expect(sql).toBeDefined();
  expect(params).toEqual(['https://worthy-emu-42.trycloudflare.com', 2]);
});

test('discovery also reads cloudflared stderr', async () => {
  const docker = fakeDocker({
    containerLogsText: jest.fn().mockResolvedValue({ stdout: '', stderr: 'https://stderr-only.trycloudflare.com\n' }),
  });
  await expect(tunnelService.ensureDeploymentTunnel({ projectId: 1, deploymentId: 2, containerId: 'abc123', appPort: 3001, docker }))
    .resolves.toBe('https://stderr-only.trycloudflare.com');
});

test('fake-docker without tunnel methods (worker.test style) never throws', async () => {
  const bare = {};
  const url = await tunnelService.ensureDeploymentTunnel({ projectId: 1, deploymentId: 2, containerId: 'abc', appPort: 3000, docker: bare });
  expect(url).toBeNull();
  await expect(tunnelService.removeDeploymentTunnel(1, 2, bare)).resolves.toBeUndefined();
  await expect(tunnelService.removeProjectTunnels(1, bare)).resolves.toBeUndefined();
});

test('discovery timeout removes the orphan sidecar and returns null', async () => {
  const docker = fakeDocker(); // logs never contain a URL
  const url = await tunnelService.ensureDeploymentTunnel({ projectId: 1, deploymentId: 2, containerId: 'abc', appPort: 3000, docker });
  expect(url).toBeNull();
  // Once for pre-clean, once for timeout cleanup.
  expect(docker.removeContainersByNamePrefix).toHaveBeenCalledWith('shipyard-p1-d2-tunnel');
});

test('removeProjectTunnels matches by label, not name prefix (p1 vs p11)', async () => {
  const stopped = [];
  const docker = fakeDocker({
    listLabeled: jest.fn().mockResolvedValue([
      { Id: 'a', Labels: { 'shipyard.tunnel-for': '1/5' } },
      { Id: 'b', Labels: { 'shipyard.tunnel-for': '11/6' } },
      { Id: 'c', Labels: {} },
    ]),
    getContainer: jest.fn((id) => ({
      stop: jest.fn().mockImplementation(async () => { stopped.push(id); }),
      remove: jest.fn().mockResolvedValue({}),
    })),
  });
  await tunnelService.removeProjectTunnels(1, docker);
  expect(stopped).toEqual(['a']);
});

test('getPlatformTunnelUrl reads + caches, null when absent', async () => {
  const docker = fakeDocker({
    containerLogsText: jest.fn().mockResolvedValue({ stdout: 'visit https://bright-lab-7.trycloudflare.com soon\n', stderr: '' }),
  });
  const first = await tunnelService.getPlatformTunnelUrl(docker);
  const second = await tunnelService.getPlatformTunnelUrl(docker);
  expect(first).toBe('https://bright-lab-7.trycloudflare.com');
  expect(second).toBe(first);
  expect(docker.containerLogsText).toHaveBeenCalledTimes(1);
  const missing = fakeDocker({ containerLogsText: jest.fn().mockRejectedValue(new Error('no such container')) });
  await expect(tunnelService.getPlatformTunnelUrl(missing, 0)).resolves.toBeNull();
});
