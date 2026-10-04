'use strict';

const { parseMemory, parseCpu, DEFAULT_MEMORY_BYTES, DEFAULT_NANO_CPUS } = require('../src/utils/resources');

describe('resource limits', () => {
  test('defaults bound every deployment', () => {
    expect(parseMemory(undefined)).toBe(DEFAULT_MEMORY_BYTES);
    expect(parseMemory('')).toBe(DEFAULT_MEMORY_BYTES);
    expect(parseCpu(undefined)).toBe(DEFAULT_NANO_CPUS);
    expect(parseCpu(null)).toBe(DEFAULT_NANO_CPUS);
  });

  test('memory units parse', () => {
    expect(parseMemory('512M')).toBe(512 * 1024 * 1024);
    expect(parseMemory('1G')).toBe(1024 ** 3);
    expect(parseMemory('256m')).toBe(256 * 1024 * 1024);
    expect(parseMemory('1.5G')).toBe(Math.floor(1.5 * 1024 ** 3));
    expect(() => parseMemory('0.5')).toThrow(/memory_limit_too_small/);
  });

  test('invalid values rejected with 400', () => {
    expect(() => parseMemory('huge')).toThrow(/invalid_memory_limit/);
    expect(() => parseMemory('16M')).toThrow(/memory_limit_too_small/);
    expect(() => parseCpu('abc')).toThrow(/invalid_cpu_limit/);
    expect(() => parseCpu('64')).toThrow(/invalid_cpu_limit/);
    expect(parseCpu('0.5')).toBe(500 * 1000 * 1000);
  });
});
