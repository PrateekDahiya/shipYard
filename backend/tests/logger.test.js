'use strict';

// S-003: logger level filtering. No secrets, no DB.

describe('structured logger', () => {
  let logger;
  let lines;

  function capture() {
    lines = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
      lines.push(s);
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((s) => {
      lines.push(s);
      return true;
    });
  }

  beforeEach(() => {
    jest.resetModules();
    delete process.env.LOG_LEVEL;
    capture();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  test('info and above logged by default with correlation fields', () => {
    logger = require('../src/utils/logger');
    logger.info('api_request', { requestId: 'r1', method: 'GET', route: '/x', status: 200 });
    logger.debug('noisy', {});
    const info = lines.map((l) => JSON.parse(l));
    expect(info.length).toBe(1);
    expect(info[0]).toMatchObject({ level: 'info', msg: 'api_request', requestId: 'r1' });
    expect(info[0].ts).toBeTruthy();
  });

  test('LOG_LEVEL=debug opens debug, LOG_LEVEL=error silences info', () => {
    process.env.LOG_LEVEL = 'debug';
    logger = require('../src/utils/logger');
    logger.debug('d', {});
    expect(lines.length).toBe(1);

    jest.resetModules();
    capture();
    process.env.LOG_LEVEL = 'error';
    logger = require('../src/utils/logger');
    logger.info('suppressed', {});
    logger.error('shown', {});
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).level).toBe('error');
  });
});
