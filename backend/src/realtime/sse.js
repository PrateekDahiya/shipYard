'use strict';

// SSE stream: GET /api/projects/:id/events?token=<jwt>
// EventSource cannot send Authorization headers, so the Bearer token travels
// as a query param on this endpoint only. Token is verified, then the
// project membership check runs exactly like requireProjectAccess.

const { verifyToken } = require('../utils/jwt');
const { getPool } = require('../config/db');
const { subscribe } = require('./bus');

const HEARTBEAT_MS = 25000;

async function stream(req, res, next) {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'unauthorized', requestId: req.id });
    }
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'unauthorized', requestId: req.id });
    }
    const projectId = req.params.id;
    const [projects] = await getPool().query('SELECT owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
    if (projects.length === 0) {
      return res.status(404).json({ error: 'project_not_found', requestId: req.id });
    }
    if (String(projects[0].owner_id) !== String(payload.sub)) {
      const [members] = await getPool().query('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1', [
        projectId,
        payload.sub,
      ]);
      if (members.length === 0) {
        return res.status(403).json({ error: 'forbidden', requestId: req.id });
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: connected\ndata: {"projectId":${JSON.stringify(String(projectId))}}\n\n`);

    const send = (event) => {
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* client gone */
      }
    };
    const unsubscribe = subscribe(projectId, send);
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        /* client gone */
      }
    }, HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { stream };
