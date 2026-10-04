'use strict';

// Resource limit parsing + safe defaults (hardening: a deployment always runs
// bounded even when the user left limits unconfigured).

const DEFAULT_MEMORY_BYTES = 512 * 1024 * 1024;
const DEFAULT_NANO_CPUS = 500 * 1000 * 1000;

function parseMemory(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_MEMORY_BYTES;
  }
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kKmMgG])?[bB]?$/);
  if (!m) {
    const err = new Error('invalid_memory_limit');
    err.status = 400;
    throw err;
  }
  const num = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  const mult = unit === 'K' ? 1024 : unit === 'M' ? 1024 ** 2 : unit === 'G' ? 1024 ** 3 : 1;
  const bytes = Math.floor(num * mult);
  if (bytes < 64 * 1024 * 1024) {
    const err = new Error('memory_limit_too_small');
    err.status = 400;
    throw err;
  }
  return bytes;
}

function parseCpu(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_NANO_CPUS;
  }
  const num = parseFloat(String(value).trim());
  if (!Number.isFinite(num) || num <= 0 || num > 32) {
    const err = new Error('invalid_cpu_limit');
    err.status = 400;
    throw err;
  }
  return Math.floor(num * 1e9);
}

module.exports = { parseMemory, parseCpu, DEFAULT_MEMORY_BYTES, DEFAULT_NANO_CPUS };
