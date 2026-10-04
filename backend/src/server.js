'use strict';

const createApp = require('./app');
const config = require('./config');
const log = require('./utils/logger');
const shellGateway = require('./realtime/shellGateway');

const app = createApp();

function start(port) {
  const server = app.listen(port || config.port, () => {
    let envEncryption = 'off';
    try {
      envEncryption = require('./utils/secretBox').encryptionEnabled() ? 'on' : 'off';
    } catch {
      envEncryption = 'invalid-key';
    }
    log.info('backend_listening', {
      port: port || config.port,
      logLevel: process.env.LOG_LEVEL || 'info',
      dbHost: config.db.host,
      dbSsl: !!config.db.ssl,
      envEncryption,
    });
  });
  shellGateway.attach(server);
  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
