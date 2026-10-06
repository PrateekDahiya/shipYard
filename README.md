# ShipYard

Self-hosted application deployment platform (Render/Heroku-style, self-hosted, always-on).
Push a repo → ShipYard clones, builds, health-checks, and serves it with a live URL.

## Status

Phases 00–05 tested and working (see `plans/TRACKER.md`); Phase 06 hardening in progress.
Docs: `docs/API.md`, `docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/SECURITY.md`.

## Quick start (dev)

Prerequisites: Docker Desktop, Node 20+. MySQL is external (Aiven) — the compose
stack no longer ships a database container. Redis still runs locally.

Easiest (Windows, keeps windows open so you can browse progress):

```powershell
.\start-local.ps1
# frontend http://localhost:3000, backend http://localhost:4000/health
```

Manual alternative:

1. Copy env: `Copy-Item .env.example .env` and fill in `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`
   (`DB_SSL=true` plus `DB_SSL_CA_PATH` for Aiven), `DB_ENV_KEY`, `JWT_SECRET`, `REDIS_HOST/REDIS_PORT`.
2. Migrate the database: `cd backend; npm install; npm run db:migrate`
3. Start the stack: `docker compose -f docker-compose.dev.yml up -d --build`
   (frontend `http://localhost:3000`, backend `http://localhost:4000/health`)
4. Local API dev instead of the container: `cd backend; npm start` → `GET http://localhost:4000/health`
5. Local UI dev instead of the container: `cd frontend; npm install; npm run dev` → `http://localhost:3000`

Compose changes (new services, env, limits, mounts) only take effect when
containers are recreated: `docker compose -f docker-compose.dev.yml up -d --force-recreate`.

## What you get

- **Dashboard** (`/`) — live stats (projects, live, failed, never deployed), fleet mix
  (server vs static), top projects, recent deployments and failures. Metric views
  (Overview / Deployments / Failures) via the sidebar, auto-refreshes every 5s.
- **Projects** (`/projects`, `/projects/new`) — searchable project cards with live
  status; dedicated creation page (name, repo, branch, deploy type, build/run
  config) that opens the new project on success; rename from the list or from
  the project Overview tab.
- **Project pages** (`/projects/[id]`) — tabbed (deep-linkable `?tab=`): Overview
  (rename, branch & auto-deploy, live URL, webhook, rate limits), Build
  configuration, Environment, Logs, Team, Activity. Sidebar navigation mirrors
  the tabs and the section hierarchy.
- **Deployments** — history with filters; only the newest successful build shows
  the Live badge (older successes are marked Superseded); per-deployment detail
  with timeline, redeploy/cancel, and logs.
- **Logs tab** — persisted build output per deployment (search, stream/source
  filters, line numbers, follow mode) plus **live container logs** streaming
  stdout/stderr of the currently running container.
- **Environment variables** — masked by default; per-variable eye toggle reveals
  via `GET /env?includeSecretValues=true`; inline edit, bulk import, delete.
  Values are AES-256-GCM encrypted at rest (`DB_ENV_KEY`).
- **Metrics / Requests / Domains / Shell** — per-project request stats and
  latency graphs, request inspector with filters, custom-domain verification,
  and an audited container shell (WebSocket).

## Layout

- `frontend/` — Next.js 14 + TypeScript + Tailwind dashboard (12 routes: dashboard,
  login, register, projects, project creation, project detail, deployments,
  deployment detail, metrics, requests, domains, shell)
- `backend/` — Node.js + Express (JS) API (`src/config controllers routes services
  repositories middleware deployment workers runtime monitoring realtime utils`),
  migrations in `backend/migrations/` (applied with `npm run db:migrate`)
- `worker/` — deployment worker (Redis queue loop → shared pipeline in
  `backend/src/workers/deploymentWorker.js`)
- `docker-compose.dev.yml` / `docker-compose.prod.yml` — redis, backend, worker,
  frontend, traefik (+ prometheus in prod only); every service capped at
  `mem_limit: 1g`; backend mounts the Docker socket read-only for live
  container stats and logs
- `docs/` — architecture, API, operations, deployment, testing, security, decisions
- `plans/` — phased implementation plans + tracker
- `SUGGESTIONS.md` — user suggestion inbox

## API highlights

- `GET /api/overview` — dashboard rollup (projects + latest builds, counts, failures)
- `GET /api/projects/:id/runtime` — live container resources; degrades to
  `{ running: false }` instead of 500 when the container is unreachable
- `GET /api/projects/:id/container-logs?tail=200` — live stdout/stderr of the
  running container (Docker-multiplexed output demuxed server-side)
- `GET /api/projects/:id/events?token=…` — SSE stream for deployment status/log
  events (worker → Redis bus → API → browser)
- `GET /api/projects/:id/env?includeSecretValues=true` — decrypted values for
  the eye toggle (masked by default)

## Security

Real credentials live only in `.env` (gitignored) or the environment. Never commit secrets.
