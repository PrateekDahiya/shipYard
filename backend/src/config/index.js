'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
require('dotenv').config();

const fs = require('fs');

function buildDbSsl() {
  if (process.env.DB_SSL !== 'true') {
    return undefined;
  }
  // Preferred: pin Aiven CA via DB_SSL_CA_PATH (download ca.pem from Aiven console).
  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath) {
    try {
      const ca = fs.readFileSync(caPath, 'utf8');
      return { minVersion: 'TLSv1.2', ca };
    } catch (e) {
      throw new Error(`DB_SSL_CA_PATH unreadable: ${caPath}: ${e.message}`);
    }
  }
  // Dev fallback (Aiven uses a private CA): encrypt without chain verification.
  // Set DB_SSL_CA_PATH for full verification in production.
  return { minVersion: 'TLSv1.2', rejectUnauthorized: false };
}

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'shipyard',
    password: process.env.DB_PASS || 'shipyard',
    database: process.env.DB_NAME || 'shipyard',
    ssl: buildDbSsl(),
    connectTimeout: 5000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
};

if (process.env.DB_ENV_KEY && process.env.DB_ENV_KEY.trim() !== '') {
  try {
    require('../utils/secretBox').validateConfiguredKey();
  } catch (e) {
    console.error(`FATAL config: ${e.message}. Fix DB_ENV_KEY (64 hex chars) or unset it for plaintext dev storage.`);
  }
}

module.exports = config;
