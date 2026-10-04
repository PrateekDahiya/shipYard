'use strict';

const request = require('supertest');
const createApp = require('../src/app');

describe('CORS (S-002)', () => {
  test('preflight from frontend origin is allowed', async () => {
    const app = createApp();
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('API response carries ACAO header for frontend origin', async () => {
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
