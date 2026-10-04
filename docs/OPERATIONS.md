# Operations Runbook

## Required environment (production)

| Var | Purpose | Notes |
|-----|---------|-------|
| `JWT_SECRET` | Session signing | Long random string. **No default tolerated in prod.** |
| `DB_ENV_KEY` | Env-var encryption (32 bytes, 64 hex chars) | Without it, values store plaintext. Generate: `[BitConverter]::ToString((1..32 \| % {Get-Random -Max 256})).Replace('-','')` |
| `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`, `DB_SSL=true`, `DB_SSL_CA_PATH=./certs/aiven-ca.pem` | MySQL (Aiven) | Download `ca.pem` from Aiven console → `certs/` (gitignored). Dev fallback encrypts without chain verification — never prod. |
| `REDIS_HOST/REDIS_PORT` | Queues, rate limiting, worker coordination | Without it: deployments queue but never run; rate limiting fails open. |
| `FRONTEND_URL`, `PUBLIC_BASE_URL` | CORS origin, webhook URL | Must match the deployed frontend/API origins. |
| `GITHUB_CLIENT_ID/SECRET/CALLBACK_URL` | OAuth login + repo listing | GitHub App OAuth credentials. |
| `SHIPYARD_BASE_DOMAIN` | `slug.<domain>` live URLs | Wildcard DNS → Traefik. |
| `SHIPYARD_WORKDIR` | Worker build temp root | Disk with headroom; cleaned per-deployment (operator purges stale `d*` dirs). |

## Health signals
- `GET /health` (liveness), `GET /ready` (readiness: MySQL + Redis), `GET /metrics` (Prometheus).
- Watch: `shipyard_deployment_outcomes_total{status=~".*_FAILED"}` rate, queue depth (`shipyard:deployments:queue` LLEN), API p95 (`shipyard_http_duration_seconds`), `/ready` flaps.

## MySQL
- Backup: Aiven automated backups + test restores quarterly. Migrations: `cd backend && npm run db:migrate` (tracked in `schema_migrations`; DDL auto-commits — a failed file must be reconciled manually, see 2026-10-04 incident in TRACKER).
- Redis loss: queue contents + rate-limit counters vanish; in-flight `QUEUED` deployments stay `QUEUED` in MySQL — re-enqueue via worker resync (restart worker; P06 backlog: automatic resync on boot).
- Log retention: `build_logs`/`request_logs` are unbounded — add TTL/archival before sustained traffic (P06 backlog).

## Incidents
- Webhook storms: dedupe + MySQL named locks serialize same-commit deliveries; concurrent distinct commits queue normally (cap worker concurrency via queue).
- Bad deploy: `HEALTH_CHECK_FAILED` keeps the old version serving; rollback creates a new deployment from any prior commit.
- Secret leak suspicion: env reads are masked; audit/logs carry no values. Rotate `DB_ENV_KEY`? Values are per-value encrypted — rotation needs re-encryption migration (backlog).

## Known dev gaps (must close before prod)
Docker daemon + Redis absent in current dev env (live container runs unverified); containerized build sandbox (ADR-004); default caps now ship (512M/0.5 CPU) but review per workload; SSRF allowlist pass; S-003 structured logging.
