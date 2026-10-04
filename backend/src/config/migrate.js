'use strict';

// Minimal plain-SQL migration runner (ADR-003).
// Applies *.sql files in backend/migrations in lexical order, tracking
// applied files in schema_migrations. Each file must be idempotent
// (CREATE TABLE IF NOT EXISTS). Uses a transaction per file where the
// server allows it; DDL in MySQL commits implicitly, so the tracking row
// is inserted only after the file succeeds.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('migrate: no migration files found');
    return;
  }
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl,
    multipleStatements: true,
    connectTimeout: config.db.connectTimeout,
  });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [applied] = await conn.query('SELECT filename FROM schema_migrations');
    const done = new Set(applied.map((r) => r.filename));
    for (const file of files) {
      if (done.has(file)) {
        console.log(`migrate: skip ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`migrate: applying ${file} ...`);
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      console.log(`migrate: applied ${file}`);
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error(`migrate failed: ${e.message}`);
    process.exit(1);
  });
}

module.exports = run;
