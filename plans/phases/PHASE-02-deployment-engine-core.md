# Phase 02 — Deployment Engine Core (Queue → Build → Run → Route)

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M5 (deployment model, state machine, queue, worker) + M6 (clone, build, build logs) + M7 (image, container lifecycle) + M8 (health checks, Traefik, live URL, routing)
**Source:** `plans/MASTER-PROMPT.md` §§ 12–18, 30, 13–14 state machine, 24 (partial — basic switch, zero-downtime hardened in Phase 03)

## 1. Objective

First real end-to-end deployment: click Deploy → async worker clones, builds, containerizes, health-checks, routes via Traefik, app goes live at `https://<app>.shipyard.<domain>`. This is the platform's load-bearing phase.

## 2. Scope

### In scope
- Deployment model + state machine (§14): `QUEUED→CLONING→BUILDING→IMAGE_CREATED→STARTING→HEALTH_CHECKING→RUNNING→SUCCESS`, failures `CLONE_FAILED/BUILD_FAILED/IMAGE_BUILD_FAILED/START_FAILED/HEALTH_CHECK_FAILED/DEPLOYMENT_FAILED/CANCELLED`. Guarded transitions; failed ≠ running; immutable history (§8).
- Async pipeline (§13): `API → Redis queue (BullMQ) → deployment worker`. API returns immediately. Every stage has explicit state + persisted log.
- Manual deployment (§11): deploy latest branch commit / specific commit / previous deployment commit. Persist exact SHA.
- Clone + build (§16): isolated build env, workdir, env injection (build-time), timeout, stdout/stderr + exit code capture; persist + stream build logs (§25).
- Docker runtime (§15): build image, start/stop/restart/inspect, env vars, labels, network, resource limits, cleanup. No privileged containers; never expose Docker socket to user apps (§40).
- Runtime command (§17): generic `npm start` / `node server.js` / `python app.py` — no framework assumption.
- Health checks (§30): path, expected status, timeout, interval, retries. Deployment ≠ SUCCESS until health passes.
- Routing (§18): Traefik hostname → project → current deployment → container:port. Stable per-project URL; custom domains out of scope (Phase 05).
- Deployment config (§12): all fields from Phase 01 now actually honored.
- Frontend: Deployments list/detail, Deploy/Cancel/Restart/Stop, View logs, Open app; Project Overview live status + URL + commit.
- API: `POST/GET /api/projects/:id/deployments`, `GET /api/deployments/:id`, `POST /api/deployments/:id/cancel`, `POST /api/projects/:id/{start,stop,restart}`.
- Always-on (§19): RUNNING/STOPPED/CRASHED/DEPLOYING/FAILED/UNHEALTHY distinction; restart-on-crash; no auto-sleep.

### Out of scope
- Auto webhook deployments, rollback-as-new-deployment, zero-downtime swap guarantees, realtime WS (basic polling OK), metrics/requests/rate-limit, shell, custom domains. Those are Phases 03–05.

## 3. Files (expected)
```
backend/src/{deployment/{stateMachine.js,pipeline.js},queues/deploymentQueue.js,
 workers/deploymentWorker.js (steps 1–12 per §13),runtime/{docker.js,healthcheck.js,router.js},
 services/deploymentService.js,repositories/{deploymentRepo,buildRepo}}
docker/traefik/  worker/Dockerfile
```

## 4. Database
New: `deployments (immutable + controlled status updates), deployment_events, builds, build_logs (or Loki-backed + DB pointer), application_instances, health_checks, domains (internal shipyard subdomain only)`.
Indexes: `deployments(project_id, created_at)`, `deployments(commit_sha)`. Transactions for state transitions + event append.

## 5. Infra
- Traefik file/Docker provider wired to container labels; wildcard `*.shipyard.<domain>` → Traefik in dev.
- Build isolation: worker-spawned build containers with timeout + resource caps (document; harden further in Phase 05).

## 6. Tests (§37 subset — heaviest here)
- Unit: state machine valid/invalid transitions (e.g. FAILED→SUCCESS rejected).
- Integration: queue → worker with fixture repo; build timeout; health-check gate blocks SUCCESS.
- Docker/runtime: image build, env injection, restart, stop/start, resource limits, logs retrieval.
- Failure: invalid repo/commit, clone fail, build fail, Dockerfile fail, start fail, health fail — each maps to correct failure state and preserves prior healthy version if one exists (basic; full guarantee in Phase 03).
- E2E (acceptance §51 steps 12–31 subset): configure → deploy → live URL → dashboard RUNNING → logs visible.

## 7. Acceptance criteria
- [ ] Deploy of a sample Node + a sample Python app both reach SUCCESS and serve traffic on stable URLs.
- [ ] Failed deployment reports correct failure state and never shows as RUNNING.
- [ ] `docker socket` not mounted in user containers (verify via inspect).

## 8. Risks (top project risks live here)
- Docker-in-Docker / host Docker access, concurrent builds contention → Redis queue concurrency cap + per-project deploy lock (§47).
- Untrusted build commands (injection) → isolated build container + no host mounts; full audit in Phase 05.
- Traefik dynamic config race → label-contract test.
