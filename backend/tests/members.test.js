'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { canManage } = require('../src/controllers/members');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const ownerEmail = `p05m-own-${stamp}@example.com`;
const memberEmail = `p05m-mem-${stamp}@example.com`;
const strangerEmail = `p05m-str-${stamp}@example.com`;
const password = 'TestPass123!';
let ownerToken;
let memberToken;
let strangerToken;
let projectId;

describe('RBAC member management', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email IN (?, ?, ?)', [ownerEmail, memberEmail, strangerEmail]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('canManage matrix (unit)', () => {
    expect(canManage('owner', 'admin', false)).toBe(true);
    expect(canManage('admin', 'viewer', false)).toBe(true);
    expect(canManage('admin', 'admin', false)).toBe(false);
    expect(canManage('admin', 'viewer', true)).toBe(false);
    expect(canManage('developer', 'viewer', false)).toBe(false);
    expect(canManage('viewer', 'viewer', false)).toBe(false);
  });

  test('setup: owner + member + stranger + project', async () => {
    ownerToken = (await request(app).post('/api/auth/register').send({ email: ownerEmail, password, name: 'O' })).body.token;
    memberToken = (await request(app).post('/api/auth/register').send({ email: memberEmail, password, name: 'M' })).body.token;
    strangerToken = (await request(app).post('/api/auth/register').send({ email: strangerEmail, password, name: 'S' })).body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${ownerToken}`).send({ name: `p05m-${stamp}` });
    projectId = p.body.project.id;
  });

  test('stranger cannot read project; viewer grant works for owner', async () => {
    const denied = await request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${strangerToken}`);
    expect(denied.status).toBe(403);
    const add = await request(app).post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${ownerToken}`).send({ email: memberEmail, role: 'viewer' });
    expect(add.status).toBe(200);
    const canRead = await request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${memberToken}`);
    expect(canRead.status).toBe(200);
  });

  test('viewer cannot manage members; owner cannot be removed', async () => {
    const attempt = await request(app).post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${memberToken}`).send({ email: strangerEmail, role: 'viewer' });
    expect(attempt.status).toBe(403);
    const ownerId = (await request(app).post('/api/auth/login').send({ email: ownerEmail, password })).body.user.id;
    const rmOwner = await request(app).delete(`/api/projects/${projectId}/members/${ownerId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(rmOwner.status).toBe(403);
  });

  test('granting admin requires owner', async () => {
    // Promote member to admin first (as owner).
    await request(app).post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${ownerToken}`).send({ email: memberEmail, role: 'developer' });
    const asAdminActing = await request(app).post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${memberToken}`).send({ email: strangerEmail, role: 'admin' });
    expect(asAdminActing.status).toBe(403);
  });
});
