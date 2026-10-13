'use strict';

jest.mock('../src/repositories/deploymentRepo', () => ({
  appendLog: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const deploymentRepo = require('../src/repositories/deploymentRepo');
const { appendLogBestEffort } = require('../src/workers/deploymentWorker');

test('async stream log failures are swallowed instead of killing the worker', async () => {
  deploymentRepo.appendLog.mockRejectedValueOnce(Object.assign(new Error('deployment row was deleted'), { code: 'ER_NO_REFERENCED_ROW_2' }));
  await expect(appendLogBestEffort(41, 'clone', 'stderr', 'clone failed')).resolves.toBeUndefined();
});
