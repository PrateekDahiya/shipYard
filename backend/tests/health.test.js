'use strict';

const request = require('supertest');
const createApp = require('../src/app');

describe('health', () => {
  test('GET /health returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('unknown route returns 404 with requestId', async () => {
    const app = createApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
