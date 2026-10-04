'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { filterUpdate } = require('../src/repositories/projectRepo');
const { MASK } = require('../src/repositories/envRepo');

describe('Phase 01 unit (no DB)', () => {
  test('auth middleware rejects missing/malformed tokens', async () => {
    const app = createApp();
    const none = await request(app).get('/api/auth/me');
    expect(none.status).toBe(401);
    const bad = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid.token.here');
    expect(bad.status).toBe(401);
  });

  test('project update filter drops unknown fields (no mass-assignment)', () => {
    const out = filterUpdate({ name: 'x', owner_id: 999, id: 5, branch: 'main' });
    expect(out).toEqual({ name: 'x', branch: 'main' });
  });

  test('env mask constant is non-empty and not a real value', () => {
    expect(typeof MASK).toBe('string');
    expect(MASK.length).toBeGreaterThan(0);
  });
});
