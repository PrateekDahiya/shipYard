'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { cpuPercent } = require('../src/services/runtimeStatsService');
const { getPool } = require('../src/config/db');

const app = createApp();
const stamp = Date.now();
const email = `p08-${stamp}@example.com`;
const password = 'TestPass123!';
let token;
let projectId;

describe('suggestions batch APIs (overview, series, runtime)', () => {
  afterAll(async () => {
    await getPool().query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('cpuPercent math', () => {
    expect(cpuPercent({})).toBe(0);
    expect(
      cpuPercent({
        cpu_stats: { cpu_usage: { total_usage: 200, percpu_usage: [100, 100] }, system_cpu_usage: 200, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 100 },
      })
    ).toBe(200);
  });

  test('setup', async () => {
    const r = await request(app).post('/api/auth/register').send({ email, password, name: 'B' });
    token = r.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: `p08-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    projectId = p.body.project.id;
  });

  test('overview reflects project + failed deployment', async () => {
    const d = await request(app).post(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${token}`).send({ commitSha: '0be1ab1e01' });
    await getPool().query("UPDATE deployments SET status = 'BUILD_FAILED' WHERE id = ?", [d.body.deployment.id]);
    const o = await request(app).get('/api/overview').set('Authorization', `Bearer ${token}`);
    expect(o.status).toBe(200);
    expect(o.body.counts.total).toBe(1);
    expect(o.body.counts.failed).toBe(1);
    expect(o.body.projects[0].latest.status).toBe('BUILD_FAILED');
    expect(o.body.recentFailures.length).toBe(1);
  });

  test('series endpoints return buckets', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/metrics/series?type=requests&hours=24`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.points)).toBe(true);
    const d = await request(app).get(`/api/projects/${projectId}/metrics/series?type=deployments`).set('Authorization', `Bearer ${token}`);
    expect(d.status).toBe(200);
    expect(d.body.points.find((p) => p.status === 'BUILD_FAILED').n).toBeGreaterThanOrEqual(1);
  });

  test('runtime reports not-running without container', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/runtime`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.runtime.running).toBe(false);
  });
});
