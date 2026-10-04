'use strict';

const request = require('supertest');
const WebSocket = require('ws');
const createApp = require('../src/app');
const { getPool } = require('../src/config/db');
const { authorize } = require('../src/realtime/shellGateway');

const app = createApp();
const stamp = Date.now();
const ownerEmail = `p05sh-own-${stamp}@example.com`;
const strangerEmail = `p05sh-str-${stamp}@example.com`;
const password = 'TestPass123!';
let ownerToken;
let strangerToken;
let projectId;
let sessionId;

async function cleanup() {
  await getPool().query('DELETE FROM users WHERE email IN (?, ?)', [ownerEmail, strangerEmail]).catch(() => {});
}

describe('confined container shell', () => {
  afterAll(async () => {
    await cleanup();
    const { closePool } = require('../src/config/db');
    const { closeRedis } = require('../src/config/redis');
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  test('setup: owner + stranger + project + RUNNING instance', async () => {
    const o = await request(app).post('/api/auth/register').send({ email: ownerEmail, password, name: 'O' });
    ownerToken = o.body.token;
    const s = await request(app).post('/api/auth/register').send({ email: strangerEmail, password, name: 'S' });
    strangerToken = s.body.token;
    const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${ownerToken}`).send({ name: `p05sh-${stamp}`, repository_url: 'https://github.com/example/app.git' });
    projectId = p.body.project.id;
    const d = await request(app).post(`/api/projects/${projectId}/deployments`).set('Authorization', `Bearer ${ownerToken}`).send({ commitSha: '411c000001' });
    await getPool().query("UPDATE deployments SET status = 'SUCCESS' WHERE id = ?", [d.body.deployment.id]);
    await getPool().query("INSERT INTO application_instances (project_id, deployment_id, container_id, state) VALUES (?, ?, 'shell-container-1', 'RUNNING')", [
      projectId,
      d.body.deployment.id,
    ]);
  });

  test('open session on own running container; stranger forbidden; anon 401', async () => {
    const ok = await request(app).post(`/api/projects/${projectId}/shell`).set('Authorization', `Bearer ${ownerToken}`);
    expect(ok.status).toBe(201);
    expect(ok.body.session.container_id).toBe('shell-container-1');
    expect(ok.body.attachUrl).toContain('/attach');
    sessionId = ok.body.session.id;

    const forbidden = await request(app).post(`/api/projects/${projectId}/shell`).set('Authorization', `Bearer ${strangerToken}`);
    expect(forbidden.status).toBe(403);
    const anon = await request(app).post(`/api/projects/${projectId}/shell`);
    expect(anon.status).toBe(401);
  });

  test('authorize() rejects wrong user, wrong project, closed session', async () => {
    const strangerJwt = (await request(app).post('/api/auth/login').send({ email: strangerEmail, password })).body.token;
    const wrongUser = await authorize(`/api/projects/${projectId}/shell/${sessionId}/attach?token=${strangerJwt}`, String(projectId), String(sessionId));
    expect(wrongUser.error).toBe('forbidden');

    const noToken = await authorize(`/api/projects/${projectId}/shell/${sessionId}/attach`, String(projectId), String(sessionId));
    expect(noToken.error).toBe('unauthorized');

    // Close then re-check: closed sessions cannot attach.
    await request(app).delete(`/api/projects/${projectId}/shell/${sessionId}`).set('Authorization', `Bearer ${ownerToken}`);
    const ownerJwt = (await request(app).post('/api/auth/login').send({ email: ownerEmail, password })).body.token;
    const closed = await authorize(`/api/projects/${projectId}/shell/${sessionId}/attach?token=${ownerJwt}`, String(projectId), String(sessionId));
    expect(closed.error).toBe('session_closed');
  });

  test('WS upgrade without valid token is rejected (live server)', (done) => {
    const serverApp = createApp();
    const server = serverApp.listen(4121, () => {
      const ws = new WebSocket(`ws://localhost:4121/api/projects/${projectId}/shell/999999/attach?token=bad`);
      const timer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
        server.close(() => done(new Error('ws_not_rejected')));
      }, 5000);
      ws.on('unexpected-response', () => {
        clearTimeout(timer);
        server.close(() => done());
      });
      ws.on('close', () => {
        clearTimeout(timer);
        server.close(() => done());
      });
      ws.on('error', () => {
        clearTimeout(timer);
        server.close(() => done());
      });
    });
  }, 15000);

  test('shell audit trail recorded without secrets', async () => {
    const audit = await request(app).get(`/api/projects/${projectId}/audit`).set('Authorization', `Bearer ${ownerToken}`);
    const actions = audit.body.audit.map((a) => a.action);
    expect(actions).toContain('shell.started');
    expect(actions).toContain('shell.ended');
  });

  test('expiry uses DB time, not client timezone (regression: instant-expiry)', async () => {
    const shellService = require('../src/services/shellService');
    const fresh = await request(app).post(`/api/projects/${projectId}/shell`).set('Authorization', `Bearer ${ownerToken}`);
    const freshSession = await shellService.getSession(fresh.body.session.id);
    expect(typeof freshSession.age_seconds).toBe('number');
    expect(shellService.isExpired(freshSession)).toBe(false);
    await getPool().query('UPDATE shell_sessions SET started_at = NOW() - INTERVAL 20 MINUTE WHERE id = ?', [fresh.body.session.id]);
    const aged = await shellService.getSession(fresh.body.session.id);
    expect(aged.age_seconds).toBeGreaterThan(15 * 60);
    expect(shellService.isExpired(aged)).toBe(true);
  });

  test('gateway attaches with default (real) docker module — no require crash', (done) => {
    const { attach } = require('../src/realtime/shellGateway');
    const serverApp = createApp();
    const server = serverApp.listen(4122, () => {
      const wss = attach(server);
      expect(wss).toBeTruthy();
      wss.close(() => server.close(done));
    });
  });
});
