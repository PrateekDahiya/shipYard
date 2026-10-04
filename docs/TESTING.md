# Testing

## Pyramid
- **Unit** (no infra): state machine, resource parsing, queue payloads, mass-assignment filter, auth 401s, secretBox roundtrip, `canManage` matrix, hostname validation, router/label builders.
- **Integration** (live Aiven MySQL): auth, projects, env masking, audit, deployments, webhooks (HMAC/dedupe/race), rollback, shell authZ, domains, members, observability, worker pipeline with injected Docker fakes.
- **Live smoke** (real server processes): `/health`, `/ready` DB/Redis checks, SSE delivery, HMAC webhook → deploy → rollback, 401/403/409/429 behavior.
- **Blocked (no Docker daemon / no Redis)**: real image builds, container start/health/routing, WS exec attach, 429 enforcement, multi-worker fan-out.

## How to run
```powershell
Set-Location backend
npm run db:migrate
npm run lint
npm test -- --runInBand --forceExit
Set-Location ..\frontend
npm run lint; npm run build
```

## Current results (2026-10-04, Aiven MySQL 8.4.8, local Redis + Docker 29.5.3)
- Backend: **80/80 tests pass, 19 suites**, eslint clean.
- Frontend: `next lint` clean, `next build` green (12 routes).
- Perf (local server → Aiven, ms): register ~592 (bcrypt), project_create ~108, project_list ~15, project_get ~56, deploy_create ~122.
- **Live E2E (real Docker): fixture Node app `QUEUED→CLONING→BUILDING→IMAGE_CREATED→STARTING→HEALTH_CHECKING→RUNNING→SUCCESS`** with `live_url` issued; orphan-container lesson led to delete-time teardown (tested in `projectDelete.test.js`).

## Failure matrix (§37) — disposition
| Failure | Expected | Covered |
|---|---|---|
| invalid repo / clone fail | `CLONE_FAILED`, old version kept | pipeline fake test |
| bad commit checkout | `CLONE_FAILED` | pipeline (checkout nonzero) |
| build fail / timeout | `BUILD_FAILED` + exit/timeout recorded | pipeline fake tests |
| docker build fail | `IMAGE_BUILD_FAILED` | pipeline (mocked throw) |
| container start fail | `START_FAILED` | instanceService path + fake |
| health check fail | `HEALTH_CHECK_FAILED`, old version kept | pipeline + preserved-version test |
| bad/duplicate webhook, bad signature | 401 / 200 duplicate / 200 ignored | `webhooks.test.js` incl. 3-way race |
| malformed webhook JSON | 400/401, no crash | race-patch test |
| unknown rollback target | 404, history intact | `rollback.test.js` |
| Redis down | API 200 + `queued:false`; rate limit fails open | live smoke + code paths |
| MySQL down | `/ready` 503 `db:down` | live `/ready` semantics |
| unauthorized shell / cross-project | 401/403/closed-session | `shell.test.js` incl. live WS rejection |
| invalid resource caps | 400 at save time; defaults 512M/0.5 CPU | `resources.test.js` |
| invalid `DB_ENV_KEY` | boot FATAL log + explicit 500 `invalid_db_env_key` | manual (user `.env` is currently invalid — known open item) |

## Concurrency (§47)
- Simultaneous same-commit webhooks serialize on MySQL named locks (`shipyard:webhook:<project>:<sha>`) — proven by 3-way concurrent test → exactly 1 created + 2 duplicates.
- State transitions hold `SELECT ... FOR UPDATE` + `assertTransition`; terminal states immutable.
- Worker consumes via `BRPOPLPUSH` + processing list (at-least-once; pipeline is idempotent per deployment id — replays re-transition safely only from non-terminal states).

## Honest gaps (must close pre-prod)
Docker-daemon paths, Redis paths (429s, queue pickup), WS exec attach, Prometheus scrape against live traffic, load testing, log-table TTL.
