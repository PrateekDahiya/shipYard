'use strict';

// WebSocket terminal gateway for confined container shells.
// Upgrade flow re-validates everything: token → project access → session
// (open, owned by caller, unexpired) → container still belongs to the project
// and is RUNNING. Only then is docker.exec created against that container.

const { WebSocketServer } = require('ws');
const { verifyToken } = require('../utils/jwt');
const { getPool } = require('../config/db');
const shellService = require('../services/shellService');

async function authorize(url, projectId, sessionId) {
  const parsed = new URL(url, 'http://localhost');
  const token = parsed.searchParams.get('token');
  if (!token) {
    return { error: 'unauthorized' };
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return { error: 'unauthorized' };
  }
  const [projects] = await getPool().query('SELECT owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (projects.length === 0) {
    return { error: 'project_not_found' };
  }
  if (String(projects[0].owner_id) !== String(payload.sub)) {
    const [members] = await getPool().query('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1', [
      projectId,
      payload.sub,
    ]);
    if (members.length === 0) {
      return { error: 'forbidden' };
    }
  }
  const session = await shellService.getSession(sessionId);
  if (!session || String(session.project_id) !== String(projectId) || String(session.user_id) !== String(payload.sub)) {
    return { error: 'forbidden' };
  }
  if (session.status !== 'open') {
    return { error: 'session_closed' };
  }
  if (shellService.isExpired(session)) {
    await shellService.closeSession(sessionId, { expired: true });
    return { error: 'session_expired' };
  }
  const [instances] = await getPool().query(
    "SELECT container_id FROM application_instances WHERE project_id = ? AND container_id = ? AND state = 'RUNNING' LIMIT 1",
    [projectId, session.container_id]
  );
  if (instances.length === 0) {
    return { error: 'no_running_instance' };
  }
  return { userId: payload.sub, containerId: session.container_id };
}

async function openExec(docker, containerId) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/sh'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  return exec.start({ hijack: true, stdin: true });
}

function attach(server, { docker } = {}) {
  const dockerMod = docker || require('../runtime/docker');
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    const match = pathname.match(/^\/api\/projects\/(\d+)\/shell\/(\d+)\/attach$/);
    if (!match) {
      return;
    }
    const [, projectId, sessionId] = match;
    let auth;
    try {
      auth = await authorize(req.url, projectId, sessionId);
    } catch {
      socket.destroy();
      return;
    }
    if (auth.error) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, async (ws) => {
      let stream = null;
      try {
        stream = await openExec(dockerMod, auth.containerId);
      } catch {
        try {
          ws.close(1011, 'exec_failed');
        } catch {
          /* noop */
        }
        return;
      }
      const onData = (data) => {
        try {
          ws.send(data.toString());
        } catch {
          /* client gone */
        }
      };
      stream.on('data', onData);
      ws.on('message', (msg) => {
        try {
          stream.write(msg.toString());
        } catch {
          /* exec gone */
        }
      });
      const cleanup = async () => {
        try {
          stream.removeListener('data', onData);
          stream.end();
        } catch {
          /* noop */
        }
        await shellService.closeSession(sessionId).catch(() => {});
      };
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    });
  });

  return wss;
}

module.exports = { attach, authorize };
