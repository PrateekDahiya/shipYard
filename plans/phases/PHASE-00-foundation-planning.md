# Phase 00 — Foundation, Architecture & Dev Environment

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M0 (analysis, architecture, risk, plan) + M1 (project foundation)
**Source:** `plans/MASTER-PROMPT.md` §§ 1–4, 7–8 (partial), 38, 43–44, 50

## 1. Objective

Establish a buildable, runnable skeleton of ShipYard with agreed architecture, and a one-command local dev environment. No product features yet — this phase makes all later phases possible.

## 2. Scope

### In scope
- M0: repository analysis (repo is currently empty except `plans/` — record this), architecture definition (control/data plane, component diagram), risk assessment, detailed implementation plan (`docs/PLAN.md` per §44).
- M1: monorepo/project scaffolding:
  - `frontend/` — Next.js + TypeScript + Tailwind skeleton, health page, API proxy stub.
  - `backend/` — Node.js + Express (JS) skeleton per §7 layout (`config/controllers/routes/services/repositories/middleware/utils`), `/health`, `/ready` stubs.
  - `worker/` — placeholder deployment-worker entrypoint (no real logic; picks up queue lib).
  - `docker-compose.dev.yml` — `frontend, backend, worker, mysql, redis, traefik, prometheus, loki` (§38).
  - MySQL migration system choice + initial no-op/extension-point migration; Redis client wiring.
  - Base docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS/` (ADR-001 stack, ADR-002 repo layout, ADR-003 migration tool).
  - CI skeleton per §42 (install → lint → format → test → build).

### Out of scope
- Auth, projects, GitHub, deployments, Docker runtime, observability. Stub routes only.

## 3. Architecture / Files

New top-level layout:
```
frontend/ backend/src/{config,controllers,routes,services,repositories,middleware,utils}
worker/src/{queues,workers}  docs/  docker-compose.dev.yml  .github/workflows/ci.yml
```
Control/data plane separation documented but not yet enforced in code (§4).

## 4. Database
- Target: external Aiven MySQL (`shipyard` DB, host/port provided via env `DB_HOST/DB_USER/DB_PASS/DB_NAME/DB_PORT`) — credentials supplied separately, never committed to repo.
- Local fallback: `docker-compose.dev.yml` mysql service for offline dev (compose file keeps mysql for parity, but default dev points at Aiven when env present).
- Choose migrator (e.g. `knex` or `db-migrate` — decide in plan review, record as ADR).
- No domain tables yet. Only `migrations` bookkeeping table + verified connect/retry logic (TLS to Aiven required).
- Deliberate: no ephemeral runtime state in MySQL (§2).

## 5. API / Frontend / Infra deltas
- API: `GET /health`, `GET /ready` only.
- Frontend: layout shell + nav stubs (§5 nav list) with "not implemented" states — no fake data (§45).
- Infra: compose services start clean; Traefik/Prometheus/Loki present but unwired to app logic.

## 6. Tests (§37 subset)
- Unit: config parsing, health handler.
- Integration: backend→MySQL ping, backend→Redis ping via compose.
- E2E: `docker compose -f docker-compose.dev.yml up` → frontend loads, `/health` 200.

## 7. Acceptance criteria
- [ ] `docs/PLAN.md` + `ARCHITECTURE.md` exist and match implemented layout.
- [ ] `docker-compose.dev.yml up` brings up all 8 services without manual DB/Redis setup.
- [ ] Frontend `npm run build`, backend `npm test` + lint pass in CI.
- [ ] No domain tables, no fake dashboards.

## 8. Risks
- MySQL/Redis version drift; Docker-in-Docker later needs host planning → note constraint now, solve in Phase 02.
- Over-scaffolding → keep to layout above, nothing more.
