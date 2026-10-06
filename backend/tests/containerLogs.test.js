'use strict';

// Unit tests for instanceService.containerLogs (no MySQL/Docker needed).
// The endpoint must degrade to { running: false } on Docker-side failures.

jest.mock('../src/config/db', () => ({ getPool: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getPool } = require('../src/config/db');
const service = require('../src/services/instanceService');
const { demuxBuffer } = require('../src/runtime/docker');

function frame(type, text) {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function mockQuery(result) {
  getPool.mockReturnValue({ query: jest.fn().mockResolvedValue(result) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('no running instance -> not running without touching docker', async () => {
  mockQuery([[]]);
  const docker = { containerLogsText: jest.fn() };
  const r = await service.containerLogs(512, docker);
  expect(r).toEqual({ running: false });
  expect(docker.containerLogsText).not.toHaveBeenCalled();
});

test('docker failure degrades to not running', async () => {
  mockQuery([[{ container_id: 'deadbeefcafe', deployment_id: 3 }]]);
  const docker = { containerLogsText: jest.fn().mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })) };
  const r = await service.containerLogs(512, docker);
  expect(r).toEqual({ running: false });
});

test('happy path prefixes streams and caps tail', async () => {
  mockQuery([[{ container_id: 'abc123def456789', deployment_id: 7 }]]);
  const docker = {
    containerLogsText: jest.fn().mockResolvedValue({
      stdout: 'a\n\nb\n',
      stderr: 'boom\n',
    }),
  };
  const r = await service.containerLogs(512, docker, 200);
  expect(r.running).toBe(true);
  expect(r.deploymentId).toBe(7);
  expect(r.container).toBe('abc123def456');
  expect(r.lines).toEqual(['[container/stdout] a', '[container/stdout] b', '[container/stderr] boom']);
  expect(docker.containerLogsText).toHaveBeenCalledWith('abc123def456789', { tail: 200 });
});

describe('demuxBuffer (docker multiplex framing)', () => {
  test('splits stdout/stderr frames', () => {
    const r = demuxBuffer(Buffer.concat([frame(1, 'hello\n'), frame(2, 'boom\n'), frame(1, 'bye\n')]));
    expect(r).toEqual({ stdout: 'hello\nbye\n', stderr: 'boom\n' });
  });

  test('plain text falls back to stdout (TTY mode)', () => {
    expect(demuxBuffer(Buffer.from('just text\n'))).toEqual({ stdout: 'just text\n', stderr: '' });
    expect(demuxBuffer(Buffer.from('x'))).toEqual({ stdout: 'x', stderr: '' });
    expect(demuxBuffer(Buffer.alloc(0))).toEqual({ stdout: '', stderr: '' });
  });

  test('truncated final frame is salvaged, garbage stops parsing', () => {
    const full = frame(1, 'ok\n');
    const partial = frame(2, 'partial');
    const cut = Buffer.concat([full, partial.subarray(0, 10), Buffer.from([9, 9, 9, 9, 9, 9, 9, 9])]);
    const r = demuxBuffer(cut);
    expect(r.stdout).toBe('ok\n');
    // Truncated frame is salvaged (trailing bytes ride along); the bogus
    // 0x09 header then stops parsing instead of emitting garbage frames.
    expect(r.stderr.startsWith('pa')).toBe(true);
  });
});

test('tail is clamped to 1..1000', async () => {
  mockQuery([[{ container_id: 'abc', deployment_id: 1 }]]);
  const docker = { containerLogsText: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }) };
  await service.containerLogs(512, docker, 99999);
  expect(docker.containerLogsText).toHaveBeenCalledWith('abc', { tail: 1000 });
});
