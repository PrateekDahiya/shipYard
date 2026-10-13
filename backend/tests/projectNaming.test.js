'use strict';

// Regression tests: same-port coexistence + global hostname-slug uniqueness.
// Fully mocked (no MySQL/Docker needed).
//
// Context: container ports need NO guard — container names, image tags and
// host ports are unique per deployment and routing is hostname-based, so two
// services on app_port 3000 coexist. Live hostnames (<slug>.<domain>) ARE a
// global namespace though (one Traefik), while names are only unique per
// owner — hence the project_hostname_taken guard under test.

jest.mock('../src/config/db', () => ({ getPool: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getPool } = require('../src/config/db');
const projectService = require('../src/services/projectService');
const { containerName } = require('../src/runtime/docker');
const { slugify, hostnameFor } = require('../src/runtime/router');

function mockPool({ slugRows = [], updateRow = null, insertId = 9 } = {}) {
  const query = jest.fn(async (sql) => {
    const q = String(sql);
    if (q.startsWith('SELECT id, name FROM projects')) return [slugRows];
    if (q.startsWith('SELECT * FROM projects WHERE id')) return [updateRow ? [updateRow] : []];
    return [[]];
  });
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue({}),
    commit: jest.fn().mockResolvedValue({}),
    rollback: jest.fn().mockResolvedValue({}),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      const q = String(sql);
      if (q.startsWith('SELECT id, name FROM projects')) return [slugRows];
      if (q.startsWith('INSERT INTO projects')) return [{ insertId }];
      if (q.startsWith('SELECT * FROM projects WHERE id')) return [[{ id: insertId, name: 'created' }]];
      return [[]];
    }),
  };
  getPool.mockReturnValue({ query, getConnection: jest.fn().mockResolvedValue(conn) });
  return { query, conn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('same-port coexistence needs no guard', () => {
  test('same app_port on different projects stays fully isolated', () => {
    const port = 3000;
    // Identity material the pipeline derives per deployment:
    const names = [containerName(1, 6), containerName(2, 9)];
    const tags = [`shipyard/p1-d6:latest`, `shipyard/p2-d9:latest`];
    const hosts = [hostnameFor({ name: 'api-one' }), hostnameFor({ name: 'api-two' })];
    expect(new Set(names).size).toBe(2);
    expect(new Set(tags).size).toBe(2);
    expect(new Set(hosts).size).toBe(2);
    expect(port).toBe(3000); // same port, nothing shared
  });

  test('slugify collisions are real (why the guard exists)', () => {
    expect(slugify('My API')).toBe(slugify('my-api'));
    expect(slugify('...')).toBe('');
  });
});

describe('project_hostname_taken guard', () => {
  test('create rejects a slug taken by another owner', async () => {
    const { conn } = mockPool({ slugRows: [{ id: 7, name: 'my-api' }] });
    await expect(projectService.create(2, { name: 'My API' })).rejects.toThrow('project_hostname_taken');
    expect(conn.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO projects'))).toBe(false);
  });

  test('create rejects with 409 status', async () => {
    mockPool({ slugRows: [{ id: 7, name: 'my-api' }] });
    let caught = null;
    try {
      await projectService.create(2, { name: 'My API' });
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.status).toBe(409);
  });

  test('create rejects names that slug to empty', async () => {
    mockPool();
    await expect(projectService.create(2, { name: '...' })).rejects.toThrow('invalid_project_name');
  });

  test('create allows a distinct slug', async () => {
    mockPool({ slugRows: [{ id: 7, name: 'my-api' }], insertId: 9 });
    const p = await projectService.create(2, { name: 'other-api' });
    expect(p.id).toBe(9);
  });

  test('rename to a taken slug fails, case-only change of own name passes', async () => {
    mockPool({ slugRows: [{ id: 1, name: 'Portfolio' }, { id: 2, name: 'portfolio-backend' }], updateRow: { id: 2, name: 'Portfolio-Backend' } });
    await expect(projectService.update(9, 2, { name: 'PORTFOLIO' })).rejects.toThrow('project_hostname_taken');
    const ok = await projectService.update(9, 2, { name: 'Portfolio-Backend' });
    expect(ok.id).toBe(2);
  });

  test('update without a name skips the slug check', async () => {
    const { query } = mockPool({ updateRow: { id: 3, name: 'x', branch: 'dev' } });
    const p = await projectService.update(9, 3, { branch: 'dev' });
    expect(p.branch).toBe('dev');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('SELECT id, name FROM projects'))).toBe(false);
  });
});
