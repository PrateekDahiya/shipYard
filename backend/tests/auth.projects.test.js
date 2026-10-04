'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');

// Deterministic plaintext mode for these legacy assertions (encryption is
// covered separately in envCrypto.test.js with its own key).
delete process.env.DB_ENV_KEY;

const app = createApp();
const stamp = Date.now();
const emailA = `p01a-${stamp}@example.com`;
const emailB = `p01b-${stamp}@example.com`;
const password = 'TestPass123!';
let tokenA;
let tokenB;
let projectId;

async function cleanup() {
  const pool = getPool();
  await pool.query('DELETE FROM users WHERE email IN (?, ?)', [emailA, emailB]);
}

describe('Phase 01 integration (Aiven MySQL)', () => {
  afterAll(async () => {
    await cleanup().catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
  });

  test('register A + B, duplicate email rejected, weak password rejected', async () => {
    const ra = await request(app).post('/api/auth/register').send({ email: emailA, password, name: 'A' });
    expect(ra.status).toBe(201);
    tokenA = ra.body.token;
    expect(tokenA).toBeTruthy();

    const dup = await request(app).post('/api/auth/register').send({ email: emailA, password, name: 'A2' });
    expect(dup.status).toBe(409);

    const weak = await request(app).post('/api/auth/register').send({ email: 'weak-x@example.com', password: 'short' });
    expect(weak.status).toBe(400);

    const rb = await request(app).post('/api/auth/register').send({ email: emailB, password, name: 'B' });
    expect(rb.status).toBe(201);
    tokenB = rb.body.token;
  });

  test('login works, wrong password fails, /me returns user', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: emailA, password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: emailA, password: 'WrongPass999' });
    expect(bad.status).toBe(401);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(emailA);
    expect(me.body.user.password_hash).toBeUndefined();
  });

  test('project CRUD + cross-user isolation', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `p01-proj-${stamp}`, branch: 'main', app_port: 3000 });
    expect(created.status).toBe(201);
    projectId = created.body.project.id;

    const forbidden = await request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(forbidden.status).toBe(403);

    const anon = await request(app).get('/api/projects');
    expect(anon.status).toBe(401);

    const patched = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ branch: 'develop', app_port: 8080 });
    expect(patched.status).toBe(200);
    expect(patched.body.project.branch).toBe('develop');
  });

  test('env vars masked, secrets never returned', async () => {
    const put = await request(app)
      .post(`/api/projects/${projectId}/env`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'SECRET_KEY', value: 'super-secret-value', is_secret: true, scope: 'both' });
    expect(put.status).toBe(200);
    expect(put.body.variable.value).not.toContain('super-secret');

    const listed = await request(app).get(`/api/projects/${projectId}/env`).set('Authorization', `Bearer ${tokenA}`);
    expect(listed.status).toBe(200);
    const found = listed.body.variables.find((v) => v.key === 'SECRET_KEY');
    expect(found).toBeTruthy();
    expect(JSON.stringify(listed.body)).not.toContain('super-secret-value');

    const del = await request(app)
      .delete(`/api/projects/${projectId}/env/SECRET_KEY`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
  });

  test('audit log recorded without secrets', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/audit`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const actions = res.body.audit.map((a) => a.action);
    expect(actions).toContain('project.created');
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
  });

  test('delete project', async () => {
    const del = await request(app).delete(`/api/projects/${projectId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
  });
});
