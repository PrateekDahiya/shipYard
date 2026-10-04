'use strict';

// Worker pipeline orchestration with injected fakes (no Docker daemon needed).

const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');
const { runDeployment } = require('../src/workers/deploymentWorker');

const app = createApp();
const stamp = Date.now();
const email = `p02w-${stamp}@example.com`;
let token;
let projectId;

function fakeExecFactory(failOn) {
  return async (cmd) => {
    if (failOn && cmd.includes(failOn)) {
      return { exitCode: 1, stdout: '', stderr: 'boom', timedOut: false };
    }
    return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false };
  };
}

function fakeDocker(containerId) {
  return {
    baseLabels: (p, d) => ({ p: String(p), d: String(d) }),
    traefikLabels: () => ({}),
    containerName: (p, d) => `shipyard-p${p}-d${d}`,
    buildImage: async () => [],
    startContainer: async () => ({ id: containerId }),
    stopAndRemove: async () => {},
  };
}

describe('worker pipeline with fakes', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
  });

  test('setup', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password: 'TestPass123!', name: 'W' });
    token = r.body.token;
    const p = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `p02w-proj-${stamp}`, repository_url: 'https://github.com/example/app', build_command: 'npm run build' });
    projectId = p.body.project.id;
  });

  test('full pipeline reaches SUCCESS with healthy app', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'deadbeef' });
    const id = c.body.deployment.id;
    const final = await runDeployment(id, {
      docker: fakeDocker(`fake-ok-${id}`),
      dockerfile: { ensure: () => ({ used: 'custom', stack: 'custom' }) },
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: { ok: true } }) },
      exec: fakeExecFactory(null),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('SUCCESS');
    expect(final.live_url).toContain('http://');
  });

  test('failed build maps to BUILD_FAILED (never SUCCESS)', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'badb0011' });
    const final = await runDeployment(c.body.deployment.id, {
      docker: fakeDocker(`fake-build-${c.body.deployment.id}`),
      dockerfile: { ensure: () => ({ used: 'custom', stack: 'custom' }) },
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: {} }) },
      exec: fakeExecFactory('npm run build'),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('BUILD_FAILED');
  });

  test('clone failure maps to CLONE_FAILED', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'badc10e1' });
    const final = await runDeployment(c.body.deployment.id, {
      docker: fakeDocker(`fake-clone-${c.body.deployment.id}`),
      dockerfile: { ensure: () => ({ used: 'custom', stack: 'custom' }) },
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: {} }) },
      exec: async (cmd) => (String(cmd).includes('git clone') ? { exitCode: 128, stdout: '', stderr: 'repository not found', timedOut: false } : { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('CLONE_FAILED');
  });

  test('failed health check maps to HEALTH_CHECK_FAILED', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'ea17c01e' });
    const final = await runDeployment(c.body.deployment.id, {
      docker: fakeDocker(`fake-health-${c.body.deployment.id}`),
      dockerfile: { ensure: () => ({ used: 'custom', stack: 'custom' }) },
      health: { waitHealthy: async () => ({ healthy: false, attempts: 3, last: {} }) },
      exec: fakeExecFactory(null),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('HEALTH_CHECK_FAILED');
  });

  test('docker build failure maps to IMAGE_BUILD_FAILED (never phantom SUCCESS)', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: '1a6ef001ab' });
    const id = c.body.deployment.id;
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const dir = path.join(process.env.SHIPYARD_WORKDIR || path.join(os.tmpdir(), 'shipyard-builds'), `d${id}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"imgfail-test"}');
    const final = await runDeployment(id, {
      docker: {
        ...fakeDocker(`fake-imgfail-${id}`),
        buildImage: async () => {
          throw new Error('The command returned a non-zero code: 1');
        },
      },
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: {} }) },
      exec: fakeExecFactory(null),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('IMAGE_BUILD_FAILED');
  });

  test('generated Dockerfile path reaches SUCCESS without repo Dockerfile', async () => {
    const c = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: '6e6e2a7ed0' });
    const id = c.body.deployment.id;
    // Simulate a cloned Node repo with no Dockerfile.
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const dir = path.join(process.env.SHIPYARD_WORKDIR || path.join(os.tmpdir(), 'shipyard-builds'), `d${id}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"gen-test"}');
    const final = await runDeployment(id, {
      docker: fakeDocker(`fake-gen-${id}`),
      // NOTE: real ensure() — no dockerfile dep passed.
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: { ok: true } }) },
      exec: fakeExecFactory(null),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('SUCCESS');
    expect(fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8')).toContain('FROM node:20-alpine');
  });

  test('static project reaches SUCCESS via generated nginx Dockerfile', async () => {
    const p = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `p02static-${stamp}`, repository_url: 'https://github.com/example/static.git', deploy_type: 'static', output_dir: 'dist' });
    const pid = p.body.project.id;
    const c = await request(app)
      .post(`/api/projects/${pid}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: '57a71c0001' });
    const id = c.body.deployment.id;
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const dir = path.join(process.env.SHIPYARD_WORKDIR || path.join(os.tmpdir(), 'shipyard-builds'), `d${id}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"static-test"}');
    const final = await runDeployment(id, {
      docker: fakeDocker(`fake-static-${id}`),
      health: { waitHealthy: async () => ({ healthy: true, attempts: 1, last: { ok: true } }) },
      exec: fakeExecFactory(null),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('SUCCESS');
    expect(fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8')).toContain('FROM nginx:alpine');
  });
});
