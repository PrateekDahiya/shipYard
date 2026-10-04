'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const githubRoutes = require('./routes/github');
const deploymentRoutes = require('./routes/deployments');
const webhookRoutes = require('./routes/webhooks');
const observabilityRoutes = require('./routes/observability');
const shellRoutes = require('./routes/shell');
const domainRoutes = require('./routes/domains');
const { httpMetrics, register } = require('./monitoring/prometheus');
const { requestLogger } = require('./middleware/requestLog');

function createApp() {
  const app = express();
  app.use(
    cors({
      origin: config.frontendUrl,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );
  app.use(requestId);
  // Webhook needs the RAW body for HMAC verification — mount before express.json.
  app.use('/api/github/webhook', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes);
  app.use(express.json());
  app.use(httpMetrics);
  app.use(requestLogger);
  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });
  app.use('/', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/github', githubRoutes);
  app.use('/api', deploymentRoutes);
  app.use('/api', observabilityRoutes);
  app.use('/api', shellRoutes);
  app.use('/api', domainRoutes);
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', requestId: req.id });
  });
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
