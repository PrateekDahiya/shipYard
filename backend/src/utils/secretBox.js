'use strict';

// AES-256-GCM value encryption for environment variables (at rest).
// Key from DB_ENV_KEY (32 bytes, hex or base64). Stored format:
//   "enc:v1:<base64 iv>:<base64 ciphertext>:<base64 tag>"
// Values without the "enc:" prefix are legacy plaintext and read as-is,
// so enabling the key later does not break existing rows.

const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function loadKey() {
  const raw = process.env.DB_ENV_KEY;
  if (!raw) {
    return null;
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    key = Buffer.from(raw.trim(), 'hex');
  } else {
    key = Buffer.from(raw.trim(), 'base64');
  }
  if (key.length !== 32) {
    throw new Error('DB_ENV_KEY must decode to 32 bytes (64 hex chars or 44 base64 chars)');
  }
  return key;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plaintext) {
  const key = loadKey();
  if (!key) {
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

function decrypt(stored) {
  if (!isEncrypted(stored)) {
    return stored;
  }
  const key = loadKey();
  if (!key) {
    const err = new Error('value_encrypted_but_no_key');
    err.status = 500;
    throw err;
  }
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('malformed_encrypted_value');
  }
  const [ivB64, ctB64, tagB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return decipher.update(Buffer.from(ctB64, 'base64'), undefined, 'utf8') + decipher.final('utf8');
}

function encryptionEnabled() {
  try {
    return !!loadKey();
  } catch {
    return false;
  }
}

function validateConfiguredKey() {
  const raw = process.env.DB_ENV_KEY;
  if (!raw || raw.trim() === '') {
    return { configured: false };
  }
  loadKey();
  return { configured: true };
}

module.exports = { encrypt, decrypt, isEncrypted, encryptionEnabled, validateConfiguredKey, PREFIX };
