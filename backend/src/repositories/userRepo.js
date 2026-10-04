'use strict';

const { getPool } = require('../config/db');

async function findByEmail(email) {
  const [rows] = await getPool().query('SELECT id, email, password_hash, name FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await getPool().query('SELECT id, email, name, created_at FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ email, passwordHash, name }) {
  const [result] = await getPool().query('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)', [
    email,
    passwordHash,
    name || null,
  ]);
  return findById(result.insertId);
}

module.exports = { findByEmail, findById, create };
