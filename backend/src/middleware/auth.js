'use strict';

const { verifyToken } = require('../utils/jwt');

// Bearer auth. Sets req.user = { id, email } or 401.
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', requestId: req.id });
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized', requestId: req.id });
  }
}

module.exports = auth;
