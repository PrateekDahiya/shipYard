# ShipYard

Self-hosted application deployment platform for teams that want a Render/Heroku-style workflow on their own infrastructure.

Push a repository, configure its runtime, deploy it through a worker, health-check the running instance, and expose it through a live URL.

## Current Stage

Phases 00-05 are implemented and tested. Phase 06 hardening is in progress.

The current frontend stage includes:

- Responsive dark/light dashboard shell with a restrained charcoal and steel-blue palette.
- Overview dashboard with fleet health, deployments, incidents, and service activity.
- Service register with search, status filters, responsive table/card layouts, and rename support.
- Direct `Open live` actions wherever a current running service is listed.
- Project configuration tabs for overview, build, environment, logs, team, and activity.
- Deployment history, status filters, redeploy/cancel actions, timelines, and live logs.
- Client-side GET caching and request deduplication with explicit no-cache handling for secrets and live logs.
- SSE-driven deployment refresh with polling fallback when a browser cannot keep an event stream.
- Server-side deployment pagination, commit/branch search, date filters, and status filters.
- Isolated preview deployments with preview hostnames and explicit promotion to production.
- GitHub repository picker and signed pull-request preview deployment hooks.
- Masked environment version history with restore support.
- Project alert rules with signed HTTPS webhook delivery.
- Configurable database log/event cleanup command.
- Organization/workspace foundation APIs with automatic workspace bootstrap.
- Mobile-safe forms, tables, navigation, and page actions.

The backend still requires a reachable MySQL database for authentication and project data. The development compose stack does not seed demo data. If the configured external MySQL host is unavailable, the UI can render but authenticated data requests will fail.

See `plans/TRACKER.md` for phase progress and `SUGGESTIONS.md` for the current improvement backlog.

## Quick Start

Prerequisites: Node 20+, npm, Docker Desktop, Docker Compose, reachable MySQL, and Redis.

MySQL is external in the current topology. Redis runs through Docker Compose.

Use exactly one runtime for the frontend/backend ports. Do not run the compose frontend and the local frontend on the same port at the same time.

### Compose Runtime

```powershell
Copy-Item .env.example .env
# Fill DB_*, DB_ENV_KEY, JWT_SECRET, REDIS_* and any public URL settings.

docker compose -f docker-compose.dev.yml up -d --build
Invoke-RestMethod http://localhost:4000/health
```

The compose runtime exposes:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- Traefik: `http://localhost:80`
- Traefik dashboard: `http://localhost:8080`

Recreate services after compose configuration changes:

```powershell
docker compose -f docker-compose.dev.yml up -d --build --force-recreate
```

### Windows Local Runner

```powershell
.\start-local.ps1
```

This starts the local backend, worker, and frontend windows and uses Docker for Redis and Traefik. It serves the frontend on `http://localhost:3000`.

### Frontend Preview Port

To keep the Docker frontend untouched while working on the UI:

```powershell
Set-Location frontend
npm install
npm run dev -- --port 3060
```

Open `http://localhost:3060`. Next proxies `/api/*` to `http://localhost:4000` by default, so the preview port does not require a separate CORS change.

### Backend Development

```powershell
Set-Location backend
npm install
npm run db:migrate
npm test
npm start
```

Health endpoints:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/ready
```

`/ready` returns `503` until MySQL and Redis are reachable.

### Demo Data

After migrations have run, create safe UI-review data without queueing Docker deployments:

```powershell
Set-Location backend
npm run db:seed:demo
```

Default demo credentials are `demo@shipyard.local` / `ShipYardDemo123!`. Override them with `DEMO_EMAIL` and `DEMO_PASSWORD` before running the seed command. The seed is idempotent and creates completed sample deployments plus request metadata.

Clean operational logs and deployment events with the configured retention window:

```powershell
Set-Location backend
$env:LOG_RETENTION_DAYS = "30"
npm run db:cleanup:logs
```

## Product Surface

- **Overview** (`/`) - fleet health, online services, active deployments, public incidents, recent movement, and attention views.
- **Services** (`/projects`) - searchable service register, status filters, responsive layouts, rename actions, and direct live-site links.
- **New service** (`/projects/new`) - repository, branch, deployment type, Dockerfile, build/run commands, working directory, port, and restart policy.
- **Project overview** (`/projects/:id`) - project identity, live deployment, branch, auto-deploy, webhook, rate limiting, and destructive actions.
- **Build** (`/projects/:id?tab=build`) - source and runtime configuration including CPU, memory, output directory, and restart policy.
- **Environment** (`/projects/:id?tab=environment`) - masked secrets, reveal/copy/edit/delete controls, and bulk `KEY=value` import.
- **Logs** (`/projects/:id?tab=logs`) - persisted deployment logs and live container logs.
- **Deployments** (`/projects/:id/deployments`) - paginated history, commit/branch search, date/status filters, production or preview targets, current live deployment, redeploy, cancel, promotion, and direct live-site links.
- **Deployment detail** (`/projects/:id/deployments/:depId`) - status, metadata, event timeline, rollback, and logs.
- **Metrics** (`/projects/:id/metrics`) - request totals, error rate, latency charts, deployment summaries, and runtime resources.
- **Requests** (`/projects/:id/requests`) - method/status/path filters and expandable request metadata.
- **Domains** (`/projects/:id/domains`) - custom domain registration, verification, and removal.
- **Shell** (`/projects/:id/shell`) - audited WebSocket shell sessions for running containers.

Preview deployments use a separate hostname such as `preview-service-key-123.shipyard.localhost`, receive only preview-targeted environment variables, and never retire the production instance. A successful preview can be promoted by creating a new production deployment from the same commit.

GitHub PR events are accepted at the existing webhook URL after a repository is linked. Supported PR actions create preview deployments for opened, reopened, ready-for-review, and synchronized pull requests when project auto-deploy is enabled.

Alert rules are available through the project API and deliver signed HTTPS JSON webhooks for deployment success/failure and public health failures.

## Caching And Freshness

The frontend keeps an in-memory, auth-scoped cache for successful GET requests and deduplicates concurrent requests. Current TTLs are intentionally short for operational data:

- Overview: 5 seconds.
- Deployments: 2.5 seconds.
- Metrics: 15 seconds.
- Requests: 10 seconds.
- Project/configuration data: 30 seconds.

Deployment status changes are also delivered through the project SSE stream. Polling remains as a fallback for disconnected clients.

Mutating requests clear the cache. Secret environment reads, deployment events, deployment logs, and container logs bypass the cache completely.

## Repository Layout

- `frontend/` - Next.js 14, React 18, TypeScript, and Tailwind dashboard.
- `backend/` - Node.js + Express API, migrations, deployment services, runtime monitoring, and WebSocket/SSE support.
- `worker/` - Redis-backed deployment worker using the shared deployment pipeline.
- `docker-compose.dev.yml` / `docker-compose.prod.yml` - local and production service definitions.
- `docs/` - architecture, API, development, operations, deployment, testing, security, and ADRs.
- `plans/` - phased implementation plans and tracker.
- `SUGGESTIONS.md` - applied suggestions and prioritized open product backlog.

## API Highlights

- `GET /api/overview` - authenticated fleet rollup with latest deployment and public health state per service.
- `GET /api/projects` - authenticated service list.
- `GET /api/projects/:id/runtime` - live CPU, memory, disk, and network resource usage.
- `GET /api/projects/:id/container-logs?tail=200` - live container output.
- `GET /api/projects/:id/events?token=...` - deployment status/log SSE stream.
- `GET /api/projects/:id/env?includeSecretValues=true` - explicit decrypted secret reveal endpoint.
- `GET /api/projects/:id/env-history?key=...` - masked environment version history.
- `POST /api/projects/:id/env/:key/rollback` - restore an environment version.
- `GET /api/projects/:id/alerts` / `POST /api/projects/:id/alerts` - project alert rules.
- `GET /api/workspaces` / `POST /api/workspaces` - organization/workspace foundation API.
- `GET /health` - liveness.
- `GET /ready` - MySQL and Redis readiness.
- `GET /metrics` - Prometheus metrics.

## Verification

Frontend:

```powershell
Set-Location frontend
npm run lint
npm run build
npm run test:e2e
```

Backend:

```powershell
Set-Location backend
npm run lint
npm test
```

The UI has been verified in Chrome at desktop and mobile viewport sizes, including the `3060` preview port.

## Security

Real credentials belong only in `.env` or the environment. Never commit secrets, database credentials, JWT keys, certificates, or decrypted environment values.
