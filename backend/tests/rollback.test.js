'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');
const { runDeployment } = require('../src/workers/deploymentWorker');

const app = createApp();
const stamp = Date.now();
const email = `p03rb-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let projectId;

describe('rollback as new deployment + old version preserved', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('setup: project with two deployments', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'RB' });
    token = r.body.token;
    const p = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `p03rb-${stamp}`, repository_url: 'https://github.com/example/app' });
    projectId = p.body.project.id;
  });

  test('rollback creates a NEW deployment from the old commit; history intact', async () => {
    const d40 = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'aaa040aaa040' });
    const d41 = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'bbb041bbb041' });
    expect(d41.body.deployment.id).toBeGreaterThan(d40.body.deployment.id);

    const rb = await request(app)
      .post(`/api/projects/${projectId}/deployments/${d40.body.deployment.id}/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect(rb.status).toBe(201);
    expect(rb.body.deployment.commit_sha).toBe('aaa040aaa040');
    expect(rb.body.deployment.trigger_type).toBe('rollback');
    expect(String(rb.body.deployment.rollback_of)).toBe(String(d40.body.deployment.id));

    const list = await request(app).get(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`);
    expect(list.body.deployments.length).toBe(3);
    const shas = list.body.deployments.map((d) => d.commit_sha);
    expect(shas).toContain('aaa040aaa040');
    expect(shas).toContain('bbb041bbb041');
    // Originals untouched: d40 still exists with its own id and no rollback_of.
    const orig = await request(app).get(`/api/projects/${projectId}/deployments/${d40.body.deployment.id}`).set('Authorization', `Bearer ${token}`);
    expect(orig.body.deployment.rollback_of).toBeNull();
  });

  test('rollback of unknown deployment → 404, history untouched', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/deployments/999999999/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(404);
  });

  test('failed new deployment preserves the healthy old version', async () => {
    // Seed a healthy old deployment + RUNNING instance.
    const old = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: '57ab1e000001' });
    const oldId = old.body.deployment.id;
    await getPool().query("UPDATE deployments SET status = 'SUCCESS', image_tag = 'img:old' WHERE id = ?", [oldId]);
    await getPool().query("INSERT INTO application_instances (project_id, deployment_id, container_id, state) VALUES (?, ?, 'old-container-1', 'RUNNING')", [
      projectId,
      oldId,
    ]);

    const stopped = [];
    const failing = await request(app)
      .post(`/api/projects/${projectId}/deployments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commitSha: 'b0e000000002' });
    const final = await runDeployment(failing.body.deployment.id, {
      dockerfile: { ensure: () => ({ used: 'custom', stack: 'custom' }) },
      docker: {
        baseLabels: () => ({}),
        traefikLabels: () => ({}),
        containerName: (p, d) => `shipyard-p${p}-d${d}`,
        buildImage: async () => [],
        startContainer: async () => ({ id: `fake-new-${failing.body.deployment.id}` }),
        stopAndRemove: async (cid) => {
          stopped.push(String(cid));
        },
      },
      health: { waitHealthy: async () => ({ healthy: false, attempts: 2, last: {} }) },
      exec: async () => ({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }),
      probeUrlFor: async () => 'http://fake/health',
    });
    expect(final.status).toBe('HEALTH_CHECK_FAILED');
    // Old container never touched; old instance still RUNNING.
    expect(stopped).not.toContain('old-container-1');
    const [rows] = await getPool().query('SELECT state FROM application_instances WHERE container_id = ?', ['old-container-1']);
    expect(rows[0].state).toBe('RUNNING');
  });
});
