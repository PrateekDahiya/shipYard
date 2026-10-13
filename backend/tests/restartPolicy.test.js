'use strict';

jest.mock('../src/config/db', () => ({ getPool: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getPool } = require('../src/config/db');
const { restartPolicyOf } = require('../src/runtime/docker');
const projectService = require('../src/services/projectService');

test('restart policy defaults to unless-stopped', () => {
  expect(restartPolicyOf(null)).toEqual({ Name: 'unless-stopped' });
  expect(restartPolicyOf(undefined)).toEqual({ Name: 'unless-stopped' });
});

test('restart policy maps Docker-supported choices', () => {
  expect(restartPolicyOf('always')).toEqual({ Name: 'always' });
  expect(restartPolicyOf('on-failure')).toEqual({ Name: 'on-failure', MaximumRetryCount: 5 });
  expect(restartPolicyOf('never')).toBeUndefined();
});

test('invalid restart policy is rejected', async () => {
  await expect(projectService.update(1, 2, { restart_policy: 'sometimes' })).rejects.toThrow('invalid_restart_policy');
});

test('saved restart policy updates live instances', async () => {
  const updateRestartPolicy = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn(async (sql) => {
    if (String(sql).startsWith('SELECT id, name FROM projects')) return [[]];
    if (String(sql).startsWith('SELECT container_id')) return [[{ container_id: 'container-1' }]];
    if (String(sql).startsWith('UPDATE projects')) return [[]];
    if (String(sql).startsWith('SELECT * FROM projects')) return [[{ id: 2, restart_policy: 'always' }]];
    return [[]];
  });
  getPool.mockReturnValue({ query });
  await projectService.update(1, 2, { restart_policy: 'always' }, { updateRestartPolicy });
  expect(updateRestartPolicy).toHaveBeenCalledWith('container-1', 'always');
});
