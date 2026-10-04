'use strict';

const bcrypt = require('bcryptjs');
const userRepo = require('../repositories/userRepo');
const { signToken } = require('../utils/jwt');

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function register({ email, password, name }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    const err = new Error('invalid_email');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 8) {
    const err = new Error('weak_password');
    err.status = 400;
    throw err;
  }
  const existing = await userRepo.findByEmail(cleanEmail);
  if (existing) {
    const err = new Error('email_taken');
    err.status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await userRepo.create({ email: cleanEmail, passwordHash, name });
  const token = signToken({ sub: user.id, email: user.email });
  return { user: { id: user.id, email: user.email, name: user.name }, token };
}

async function login({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const user = await userRepo.findByEmail(cleanEmail);
  if (!user) {
    const err = new Error('invalid_credentials');
    err.status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) {
    const err = new Error('invalid_credentials');
    err.status = 401;
    throw err;
  }
  const token = signToken({ sub: user.id, email: user.email });
  return { user: { id: user.id, email: user.email, name: user.name }, token };
}

module.exports = { register, login };
