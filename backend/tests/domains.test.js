'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const domainService = require('../src/services/domainService');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p05dom-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let userId;
let projectId;

describe('custom domains', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('hostname validation', () => {
    expect(domainService.validateHostname('api.example.com')).toBe(true);
    expect(domainService.validateHostname('not a host')).toBe(false);
    expect(domainService.validateHostname('my-app.shipyard.localhost')).toBe(false);
    expect(domainService.validateHostname('shipyard.localhost')).toBe(false);
  });

  test('setup', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'D' });
    token = r.body.token;
    userId = r.body.user.id;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p05dom-${stamp}` });
    projectId = p.body.project.id;
  });

  test('register → verify with stubbed DNS → remove', async () => {
    const host = `app${stamp % 100000}.example.com`;
    const reg = await request(app).post(`/api/projects/${projectId}/domains`).set('Authorization', `Bearer ${token}`).send({ hostname: host });
    expect(reg.status).toBe(201);
    expect(reg.body.domain.verified).toBe(0);
    expect(reg.body.verificationToken).toBeTruthy();
    const domainId = reg.body.domain.id;

    const dup = await request(app).post(`/api/projects/${projectId}/domains`).set('Authorization', `Bearer ${token}`).send({ hostname: host });
    expect(dup.status).toBe(409);

    // Wrong TXT → verification_failed.
    await expect(domainService.verify(userId, projectId, domainId, async () => [['something-else']])).rejects.toThrow();
    // Right TXT → verified.
    const verified = await domainService.verify(userId, projectId, domainId, async () => [[`shipyard-verification=${reg.body.verificationToken}`]]);
    expect(verified.verified).toBe(1);

    const listed = await request(app).get(`/api/projects/${projectId}/domains`).set('Authorization', `Bearer ${token}`);
    expect(listed.body.domains.find((d) => d.hostname === host).verified).toBe(1);

    const del = await request(app).delete(`/api/projects/${projectId}/domains/${domainId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/projects/${projectId}/domains`).set('Authorization', `Bearer ${token}`);
    expect(after.body.domains.find((d) => d.hostname === host)).toBeUndefined();
  });

  test('invalid hostnames rejected', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/domains`).set('Authorization', `Bearer ${token}`).send({ hostname: 'bad host!!' });
    expect(r.status).toBe(400);
  });
});
