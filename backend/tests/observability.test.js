'use strict';

// Phase 04: request logging, metrics API, rate-limit config.
// NOTE: rate-limit *enforcement* needs Redis; these tests cover config CRUD,
// request capture/sanitization, and metrics shape (Redis assertions are live-smoked).

const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p04-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let projectId;
let serverApp;
let server;

describe('observability (Aiven MySQL)', () => {
  beforeAll((done) => {
    serverApp = createApp();
    server = serverApp.listen(4119, done);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('setup + requests are captured without query strings', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'O' });
    token = r.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p04-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    projectId = p.body.project.id;

    await request(app).get(`/api/projects/${projectId}?token=SECRETQUERY`).set('Authorization', `Bearer ${token}`);
    await new Promise((res) => setTimeout(res, 300));

    const [rows] = await getPool().query('SELECT path FROM request_logs WHERE project_id = ? ORDER BY id DESC LIMIT 5', [projectId]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.path).not.toContain('?');
      expect(row.path).not.toContain('SECRETQUERY');
    }
  });

  test('requests API filters by status', async () => {
    const ok = await request(app).get(`/api/projects/${projectId}/requests?status=200`).set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    for (const row of ok.body.requests) {
      expect(row.status_code).toBe(200);
    }
    expect(JSON.stringify(ok.body)).not.toContain('SECRETQUERY');
  });

  test('metrics reflect real deployment + request activity', async () => {
    await request(app).post(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`).send({ commitSha: 'e7c000000001' });
    const m = await request(app).get(`/api/projects/${projectId}/metrics`).set('Authorization', `Bearer ${token}`);
    expect(m.status).toBe(200);
    const queued = m.body.deployments.byStatus.find((s) => s.status === 'QUEUED');
    expect(queued && parseInt(queued.n, 10)).toBeGreaterThanOrEqual(1);
    expect(m.body.requests.total).toBeGreaterThanOrEqual(1);
  });

  test('rate-limit config CRUD + validation', async () => {
    const bad = await request(app).put(`/api/projects/${projectId}/rate-limit`).set('Authorization', `Bearer ${token}`).send({ requests_per_minute: 0 });
    expect(bad.status).toBe(400);
    const put = await request(app)
      .put(`/api/projects/${projectId}/rate-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requests_per_minute: 100, requests_per_hour: 1000, enabled: false });
    expect(put.status).toBe(200);
    expect(put.body.config.enabled).toBe(0);
    const get = await request(app).get(`/api/projects/${projectId}/rate-limit`).set('Authorization', `Bearer ${token}`);
    expect(get.body.config.requests_per_minute).toBe(100);
  });

  test('SSE rejects unauthenticated, unknown-project guarded', async () => {
    const anon = await request(app).get(`/api/projects/${projectId}/events`);
    expect(anon.status).toBe(401);
    const badToken = await request(app).get(`/api/projects/${projectId}/events?token=invalid`);
    expect(badToken.status).toBe(401);
  });

  test('SSE delivers DEPLOYMENT_CREATED to project subscriber', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const jwt = login.body.token;
    const http = require('http');
    const chunks = [];
    await new Promise((resolve, reject) => {
      const req = http.get(
        {
          host: 'localhost',
          port: 4119,
          path: `/api/projects/${projectId}/events?token=${jwt}`,
          headers: { Accept: 'text/event-stream' },
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`sse_status_${res.statusCode}`));
            return;
          }
          res.on('data', (d) => {
            chunks.push(d.toString());
            if (chunks.join('').includes('DEPLOYMENT_CREATED')) {
              res.destroy();
              resolve();
            }
          });
        }
      );
      req.on('error', reject);
      setTimeout(() => reject(new Error('sse_timeout')), 10000);
      // Give the subscriber a moment, then trigger an event.
      setTimeout(async () => {
        await request(serverApp).post(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${jwt}`).send({ commitSha: 'e5e000000001' });
      }, 500);
    });
    expect(chunks.join('')).toContain('DEPLOYMENT_CREATED');
  });

  test('prometheus /metrics exposes shipyard series', async () => {
    const r = await request(app).get('/metrics');
    expect(r.status).toBe(200);
    expect(r.text).toContain('shipyard_http_requests_total');
    expect(r.text).toContain('shipyard_deployments_total');
  });
});
