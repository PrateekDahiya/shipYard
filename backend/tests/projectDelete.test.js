'use strict';

// Project deletion must not orphan live containers (observed live 2026-10-04:
// deleting test rows left container c80486c95dd2 running with no DB record).

const request = require('supertest');
const createApp = require('../src/app');
const projectService = require('../src/services/projectService');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p06del-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let userId;
let projectId;

describe('project delete tears down containers', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('setup', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'DEL' });
    token = r.body.token;
    userId = r.body.user.id;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p06del-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    projectId = p.body.project.id;
    const d = await request(app).post(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`).send({ commitSha: 'de1ba5e00001' });
    await getPool().query("UPDATE deployments SET status = 'SUCCESS' WHERE id = ?", [d.body.deployment.id]);
    await getPool().query("INSERT INTO application_instances (project_id, deployment_id, container_id, state) VALUES (?, ?, 'del-container-1', 'RUNNING')", [
      projectId,
      d.body.deployment.id,
    ]);
  });

  test('remove() stops the live container via injected docker', async () => {
    const stopped = [];
    await projectService.remove(userId, projectId, {
      stopAndRemove: async (cid) => {
        stopped.push(String(cid));
      },
    });
    expect(stopped).toContain('del-container-1');
    const [rows] = await getPool().query('SELECT id FROM projects WHERE id = ?', [projectId]);
    expect(rows.length).toBe(0);
  });

  test('remove() still deletes when the daemon is unreachable', async () => {
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p06del2-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    const pid2 = p.body.project.id;
    const d = await request(app).post(`/api/projects/${pid2}/deployments`).set('Authorization', `Bearer ${token}`).send({ commitSha: 'de1ba5e00002' });
    await getPool().query("INSERT INTO application_instances (project_id, deployment_id, container_id, state) VALUES (?, ?, 'del-container-2', 'RUNNING')", [
      pid2,
      d.body.deployment.id,
    ]);
    await projectService.remove(userId, pid2, {
      stopAndRemove: async () => {
        throw new Error('daemon down');
      },
    });
    const [rows] = await getPool().query('SELECT id FROM projects WHERE id = ?', [pid2]);
    expect(rows.length).toBe(0);
  });
});
