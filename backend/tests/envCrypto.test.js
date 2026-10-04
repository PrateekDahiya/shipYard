'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const secretBox = require('../src/utils/secretBox');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p03env-${stamp}@example.com`;
const password = 'TestPass123!';
const TEST_KEY = 'a'.repeat(64);
let token;
let projectId;

describe('env encryption at rest', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('secretBox roundtrips with key, passes through without key', () => {
    process.env.DB_ENV_KEY = TEST_KEY;
    const enc = secretBox.encrypt('s3cr3t-value');
    expect(enc).toContain('enc:v1:');
    expect(enc).not.toContain('s3cr3t-value');
    expect(secretBox.decrypt(enc)).toBe('s3cr3t-value');
    delete process.env.DB_ENV_KEY;
    expect(secretBox.encrypt('plain-value')).toBe('plain-value');
    expect(secretBox.decrypt('plain-value')).toBe('plain-value');
  });

  test('stored value is encrypted and API never leaks plaintext', async () => {
    process.env.DB_ENV_KEY = TEST_KEY;
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'ENV' });
    token = r.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p03env-${stamp}` });
    projectId = p.body.project.id;

    await request(app).post(`/api/projects/${projectId}/env`).set('Authorization', `Bearer ${token}`).send({
      key: 'API_TOKEN',
      value: 'token-plaintext-xyz',
      is_secret: true,
    });

    const [rows] = await getPool().query('SELECT `value` FROM environment_variables WHERE project_id = ? AND `key` = ?', [projectId, 'API_TOKEN']);
    expect(rows[0].value).toContain('enc:v1:');
    expect(rows[0].value).not.toContain('token-plaintext-xyz');

    const listed = await request(app).get(`/api/projects/${projectId}/env`).set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(listed.body)).not.toContain('token-plaintext-xyz');

    const audit = await request(app).get(`/api/projects/${projectId}/audit`).set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(audit.body)).not.toContain('token-plaintext-xyz');
    delete process.env.DB_ENV_KEY;
  });
});
