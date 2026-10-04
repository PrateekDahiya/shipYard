'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p02-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let projectId;
let deploymentId;

describe('Phase 02 deployment API (Aiven MySQL)', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
  });

  test('setup: register + project', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'P02' });
    expect(r.status).toBe(201);
    token = r.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p02-proj-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    expect(p.status).toBe(201);
    projectId = p.body.project.id;
  });

  test('omitted SHA on unreachable repo → cannot_resolve_branch', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branch: 'main' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('cannot_resolve_branch');
  });

  test('omitted SHA resolves latest commit (local repo, no network)', async () => {
    const fs = require('fs');
    const os = require('os');
    const testPath = require('path');
    const { execSync } = require('child_process');
    const dir = fs.mkdtempSync(testPath.join(os.tmpdir(), 'shipyard-ls-'));
    fs.writeFileSync(testPath.join(dir, 'f.txt'), 'hi');
    execSync('git init -q -b main', { cwd: dir });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name t', { cwd: dir });
    execSync('git add -A', { cwd: dir });
    execSync('git commit -qm seed', { cwd: dir });
    const head = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
    const repoUrl = dir.replace(/\\/g, '/');
    const p = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `p02-local-${stamp}`, repository_url: repoUrl });
    const r = await request(app)
      .post(`/api/projects/${p.body.project.id}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branch: 'main' });
    expect(r.status).toBe(201);
    expect(r.body.deployment.commit_sha).toBe(head);
    expect(r.body.deployment.status).toBe('QUEUED');
  });

  test('repo URL in commit field rejected; missing repo URL rejected', async () => {
    const notSha = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'git@github.com:PrateekDahiya/2048.git', branch: 'main' });
    expect(notSha.status).toBe(400);
    expect(notSha.body.error).toBe('invalid_commit_sha');

    const bare = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p02-norepo-${stamp}` });
    const noRepo = await request(app)
      .post(`/api/projects/${bare.body.project.id}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'abc123def456', branch: 'main' });
    expect(noRepo.status).toBe(400);
    expect(noRepo.body.error).toBe('no_repository_linked');
  });

  test('create deployment with explicit commit → QUEUED', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'abc123def456', branch: 'main', commitMessage: 'test deploy' });
    expect(r.status).toBe(201);
    expect(r.body.deployment.status).toBe('QUEUED');
    expect(r.body.deployment.commit_sha).toBe('abc123def456');
    deploymentId = r.body.deployment.id;
  });

  test('deploy_type/output_dir validated and persisted', async () => {
    const badType = await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ deploy_type: 'lambda' });
    expect(badType.status).toBe(400);
    const badDir = await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ output_dir: '../evil' });
    expect(badDir.status).toBe(400);
    const ok = await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ deploy_type: 'static', output_dir: 'dist' });
    expect(ok.status).toBe(200);
    expect(ok.body.project.deploy_type).toBe('static');
    expect(ok.body.project.output_dir).toBe('dist');
    // Restore server type for the remaining tests in this file.
    await request(app).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${token}`).send({ deploy_type: 'server', output_dir: 'build' });
  });

  test('get + list + events visible', async () => {
    const g = await request(app).get(`/api/projects/${projectId}/deployments/${deploymentId}`).set('Authorization', `Bearer ${token}`);
    expect(g.status).toBe(200);
    const l = await request(app).get(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`);
    expect(l.body.deployments.length).toBeGreaterThanOrEqual(1);
    const e = await request(app).get(`/api/projects/${projectId}/deployments/${deploymentId}/events`).set('Authorization', `Bearer ${token}`);
    expect(e.body.events[0].stage).toBe('QUEUED');
  });

  test('cancel QUEUED → CANCELLED; second cancel rejected (terminal)', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments/${deploymentId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(c.status).toBe(200);
    expect(c.body.deployment.status).toBe('CANCELLED');
    const c2 = await request(app)
      .post(`/api/projects/${projectId}/deployments/${deploymentId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(c2.status).toBe(409);
  });

  test('detail exposes direct_url from running instance host port', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'd1ec700001', branch: 'main' });
    const id = c.body.deployment.id;
    await getPool().query("INSERT INTO application_instances (project_id, deployment_id, container_id, state, host_port) VALUES (?, ?, 'direct-test-1', 'RUNNING', 59999)", [
      projectId,
      id,
    ]);
    const g = await request(app).get(`/api/projects/${projectId}/deployments/${id}`).set('Authorization', `Bearer ${token}`);
    expect(g.body.deployment.direct_url).toBe('http://localhost:59999');
  });

  test('cross-user deployment access forbidden', async () => {
    const other = await request(app).post('/api/auth/register').send({ email: `p02b-${stamp}@example.com`, password, name: 'P02B' });
    const r = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${other.body.token}`)
      .send({ commitSha: 'zzz' });
    expect(r.status).toBe(403);
    await getPool().query('DELETE FROM users WHERE email = ?', [`p02b-${stamp}@example.com`]);
  });
});
