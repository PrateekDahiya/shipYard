# ADR-003 — Migrations (decided Phase 01)

Decision: plain-SQL migration files in `backend/migrations/*.sql` + minimal runner
`backend/src/config/migrate.js` (`npm run db:migrate`), tracking via `schema_migrations`.

Rationale: zero new dependencies, plain-SQL reviewable, MySQL 8 + Aiven TLS compatible
(reuses `config.db` incl. `DB_SSL_CA_PATH`), CI-friendly single command. Files must be
idempotent (`CREATE TABLE IF NOT EXISTS`). Revisit `knex` only if query-builder needs arise.
