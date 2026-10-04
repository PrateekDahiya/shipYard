'use strict';

const crypto = require('crypto');
const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p03wh-${stamp}@example.com`;
const password = 'TestPass123!';
const SECRET = 'test-webhook-secret-12345';
const REPO_ID = 900000 + (stamp % 100000);
let token;
let projectId;

function sign(body) {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function pushBody(sha) {
  return JSON.stringify({
    ref: 'refs/heads/main',
    after: sha,
    repository: { id: REPO_ID, full_name: 'acme/demo' },
    head_commit: { id: sha, message: 'webhook deploy', author: { username: 'dev' } },
  });
}

describe('GitHub webhook auto-deploy', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
  });

  test('setup: user + project + linked repo + auto-deploy on', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'WH' });
    token = r.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p03wh-${stamp}`, repository_url: 'https://github.com/acme/demo.git' });
    projectId = p.body.project.id;
    await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ auto_deploy: 1 });
    await getPool().query(
      'INSERT INTO repositories (project_id, github_repo_id, full_name, default_branch, webhook_secret) VALUES (?, ?, ?, ?, ?)',
      [projectId, REPO_ID, 'acme/demo', 'main', SECRET]
    );
  });

  test('valid push creates webhook deployment', async () => {
    const body = pushBody('c0ffee000001');
    const r = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(r.status).toBe(201);
    expect(r.body.deployment.trigger_type).toBe('webhook');
    expect(r.body.deployment.commit_sha).toBe('c0ffee000001');
  });

  test('duplicate delivery of same live commit does not create another', async () => {
    const before = await request(app).get(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`);
    const body = pushBody('c0ffee000001');
    const r = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(r.status).toBe(200);
    expect(r.body.duplicate).toBe(true);
    const after = await request(app).get(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`);
    expect(after.body.deployments.length).toBe(before.body.deployments.length);
  });

  test('invalid signature rejected, unknown repo ignored, other events ignored', async () => {
    const body = pushBody('c0ffee000002');
    const bad = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(bad.status).toBe(401);

    const unknownBody = JSON.stringify({ ref: 'refs/heads/main', after: 'x', repository: { id: 1, full_name: 'no/one' } });
    const unknown = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', sign(unknownBody))
      .set('Content-Type', 'application/json')
      .send(unknownBody);
    expect(unknown.status).toBe(200);
    expect(unknown.body.ignored).toBe(true);

    const ping = await request(app).post('/api/github/webhook').set('X-GitHub-Event', 'ping').send('{}');
    expect(ping.status).toBe(200);
    expect(ping.body.ignored).toBe(true);
  });

  test('auto-deploy off skips creation', async () => {
    await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ auto_deploy: 0 });
    const body = pushBody('c0ffee000003');
    const r = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(r.status).toBe(200);
    expect(r.body.skipped).toBe(true);
  });

  test('concurrent duplicate deliveries create only one deployment', async () => {
    await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ auto_deploy: 1 });
    const body = pushBody('c0ffee000004');
    const sig = sign(body);
    const fire = () =>
      request(app)
        .post('/api/github/webhook')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', sig)
        .set('Content-Type', 'application/json')
        .send(body);
    const results = await Promise.all([fire(), fire(), fire()]);
    const created = results.filter((r) => r.status === 201);
    const dups = results.filter((r) => r.status === 200 && r.body.duplicate);
    expect(created.length).toBe(1);
    expect(dups.length).toBe(2);
  });

  test('malformed JSON rejected without crashing', async () => {
    const r = await request(app)
      .post('/api/github/webhook')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', sign('not-json'))
      .set('Content-Type', 'application/json')
      .send('not-json{{{');
    expect([400, 401]).toContain(r.status);
  });
});

