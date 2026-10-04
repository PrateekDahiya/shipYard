# ShipYard — Plan Tracker

> Single source of truth for phased-plan progress. Update this file on every phase transition.
> Spec source: `plans/MASTER-PROMPT.md` (M0–M21, §§1–53). Detailed plans: `plans/phases/`.

## Approval gate

Plans APPROVED by user on 2026-10-04 (response: "Approve plans & implement"). Execution of Phase 00 has begun.
External Aiven MySQL target noted (host/port/db via env; password never committed). See `phases/PHASE-00-foundation-planning.md` §4.

## Phase status

| Phase | File | Milestones | Status | Approved | Evidence |
|-------|------|------------|--------|----------|----------|
| 00 — Foundation, Architecture & Dev Env | `phases/PHASE-00-foundation-planning.md` | M0, M1 | `TESTED` | ☑ | backend lint+test 2/2 pass; frontend lint+build pass; compose config valid; live /health 200, /ready 503 (no infra, correct); worker placeholder idles correctly |
| 01 — Identity, Projects & GitHub | `phases/PHASE-01-identity-projects-github.md` | M2, M3, M4 | `TESTED` | ☑ | backend: migrate 001 on Aiven (8 tables); lint clean; 11/11 tests pass (integration vs Aiven + unit); live 401s verified. frontend: lint+build pass, 5 routes (/, /login, /register, /projects, /projects/[id]) wired to real API, no fake data |
| 02 — Deployment Engine Core | `phases/PHASE-02-deployment-engine-core.md` | M5, M6, M7, M8 | `TESTED` | ☑ | migrate 002 on Aiven (7 tables); backend lint clean, 30/30 tests (state machine, queue/labels/router, deployment API vs Aiven, pipeline SUCCESS/BUILD_FAILED/HEALTH_CHECK_FAILED with fakes); live: deploy→QUEUED (queued=false, no Redis), events recorded. frontend lint+build, 8 routes incl. deployments list/detail. Live E2E 2026-10-04: fixture app reached SUCCESS on real Docker (see changelog) |
| 03 — Lifecycle & Automation | `phases/PHASE-03-lifecycle-automation.md` | M9, M10, M11, M12 | `TESTED` | ☑ | migrate 003+004 on Aiven; env AES-256-GCM at rest (DB_ENV_KEY) + masking; webhook HMAC verify/resolve/dedupe/auto-deploy flag; rollback-as-new-deployment; old version preserved on failed deploy. 40/40 backend tests; live smoke: push→201 webhook, redelivery→duplicate, rollback→new row. frontend: rollback button, auto-deploy toggle, webhook instructions |
| 04 — Observability | `phases/PHASE-04-observability.md` | M13, M14, M15, M16 | `TESTED` | ☑ | migrate 005 on Aiven; SSE (?token=, project-scoped, bus emits on create/transition/log) incl. delivery regression test; prom-client + /metrics + DB stats API; request_logs (no query/bodies) + filtered API; fixed-window rate limiting (ADR-005, 429+Retry-After, fail-open w/o Redis). 47/47 backend tests; live SSE got DEPLOYMENT_CREATED. frontend: metrics/requests pages, rate-limit UI, SSE live tail. Fixed real bug: SSE route shadowed by projects router auth. Rate-limit *enforcement* needs Redis (absent) |
| 05 — Security & Advanced Runtime | `phases/PHASE-05-security-advanced.md` | M17, M18, M19 | `TESTED` | ☑ | migrate 006 on Aiven; shell sessions + WS gateway (15-min TTL, audit); custom domains (DNS-TXT verify); RBAC members API + matrix tests; docs/SECURITY.md (§40, 12 rows). 62/62 backend tests; live: shell 409 w/o instance, bad hostname 400, members owner. frontend: shell terminal, domains, team UI + nav polish (S-001 progress). Live exec needs Docker daemon |
| 06 — Hardening & Release | `phases/PHASE-06-hardening-release.md` | M20, M21 | `DONE` | ☑ | resource caps w/ defaults + validation; webhook named-lock race fix (3-way concurrent test); failure-matrix gaps (clone fail, malformed webhook, bad rollback); perf baseline recorded; docs §43 synced (API/OPERATIONS/DEPLOYMENT/TESTING/PROJECT_ANALYSIS/ARCHITECTURE/PLAN); prod compose + prometheus config (both compose files parse). Final: backend 69/69 + lint, frontend lint + build (12 routes) |
| 07 — Frontend vs backend deployments | `phases/PHASE-07-frontend-deployments.md` | new scope | `TESTED` | ☑ | migration 007 (deploy_type/output_dir + validation); generateStatic (nginx + SPA fallback); static pipeline branch (port 80, `/` health); type selector UI. Live proof: static fixture → SUCCESS, nginx served page 200. Suite at 87/87; frontend lint+build green |

Allowed statuses: `AWAITING REVIEW` → `APPROVED` → `IN PROGRESS` → `IMPLEMENTED` → `TESTED` → `REVIEWED` → `DONE`. Use `BLOCKED` with reason if stuck.

## Per-phase checklist (copy into phase row notes when active)

- [ ] Plan approved
- [ ] Implemented (minimal changes, existing code reused)
- [ ] Unit tests written & passing (evidence recorded, not claimed)
- [ ] Integration tests passing (if applicable)
- [ ] Static checks: lint + typecheck + build
- [ ] Actually run + inspected (logs, DB, Docker, UI)
- [ ] Review findings addressed
- [ ] Docs/CONTEXT updated

## Milestone → phase map (from MASTER-PROMPT §50)

M0,M1→P00 · M2,M3,M4→P01 · M5,M6,M7,M8→P02 · M9,M10,M11,M12→P03 · M13,M14,M15,M16→P04 · M17,M18,M19→P05 · M20,M21→P06

## How to use

1. Review each file in `plans/phases/`.
2. Reply with approvals / change requests per phase (e.g. "approve P00–P01, rework P02 scope").
3. After approval I switch TRACKER rows to `APPROVED`, then execute phase-by-phase per §44 workflow (Understand→Plan→Implement→Validate→Test→Run→Inspect→Fix→Retest→Review→Complete).
4. Every code/test run gets its result + command recorded here under Evidence — never "tests pass" without execution.

## Change log

| Date (UTC) | Change |
|------------|--------|
| 2026-10-04 | Tracker created; 7 phase plans drafted from MASTER-PROMPT.md; awaiting user review. |
| 2026-10-04 | Plans approved ("Approve plans & implement"). P00 → IN PROGRESS. Aiven MySQL noted as DB target (no secrets in repo). |
| 2026-10-04 | DB connectivity check: `DB_HOST` does not resolve (DNS NXDOMAIN, verified via nslookup/Resolve-DnsName; general DNS OK). Proceeding with env-configurable DB + local compose MySQL fallback. Awaiting corrected hostname. |
| 2026-10-04 | P00 implemented+tested (see Evidence col). Backend `/health` 200 live, `/ready` 503 degraded-correct, worker idles without Redis. Blocker: Aiven hostname unresolvable — need corrected host from Aiven console. |
| 2026-10-04 | `.env` present + gitignored (verified). Live DB test via root `.env`: DNS ENOTFOUND for configured host (Node dns.resolve4); variant without `.i.` also NXDOMAIN. No credentials sent (DNS-only after failure). DB unreachable — needs Aiven console check. |
| 2026-10-04 | New Aiven host resolves (DNS OK). Direct MySQL ping: `up version=8.4.8` (TLS dev fallback). Backend live `/ready`: `{"db":"up","redis":"down"}` → 503 (correct until Redis exists). Backend SSL now supports `DB_SSL_CA_PATH` pinning; `certs/` gitignored. |
| 2026-10-04 | P01 → TESTED. Auth (bcrypt+JWT), projects CRUD, env masking, audit, GitHub OAuth+repos/branches/commits APIs, RBAC-ready membership. Needs `JWT_SECRET` + GitHub OAuth app creds in `.env` for full OAuth flow. |
| 2026-10-04 | `SUGGESTIONS.md` inbox created (root). S-001 UI quality pass filed OPEN. S-002 CORS fixed: `cors` middleware + `FRONTEND_URL`, `tests/cors.test.js`; 13/13 tests pass, lint clean. |
| 2026-10-04 | P02 → TESTED. Deployment engine (state machine, queue, pipeline, docker/healthcheck/router modules, lifecycle API, worker loop, deployments UI). 30/30 tests. Live containers blocked: Docker daemon OFF, no Redis. |
| 2026-10-04 | P03 → TESTED. Env AES-256-GCM at rest, HMAC webhook auto-deploy + dedupe, rollback-as-new-deployment, old-version-preserved. 40/40 tests. |
| 2026-10-04 | P04 → TESTED. SSE realtime + delivery regression test (fixed auth-shadow bug), prom-client + DB metrics, sanitized request logs, fixed-window rate limiting (ADR-005). 47/47 tests. S-003 logging filed. |
| 2026-10-04 | P05 → TESTED. Shell sessions + WS gateway, custom domains (DNS-TXT), RBAC members, SECURITY.md §40 review. 62/62 tests (incl. boot-crash regression). S-001 UI progress. |
| 2026-10-04 | P06 → DONE. All 7 phases complete. Pre-prod gates (need operator): Docker daemon + Redis live paths, build sandbox, log TTL, `JWT_SECRET` + valid `DB_ENV_KEY` in `.env`. Open suggestions: S-001 (UI pass, partial progress), S-003 (structured logging). |
| 2026-10-04 | Redis provisioned by agent (`shipyard-redis` container, `start-local.ps1` ensures it + starts worker). Backend `/ready` = db+redis up. FIRST LIVE E2E: fixture app QUEUED→…→SUCCESS with live_url, then orphan-container lesson → project delete now tears down containers (tested). Suite at 72/72. |
| 2026-10-04 | #243 CLONE_FAILED diagnosed: repo URL pasted into commit field + empty project repo URL (user-side), no validation (platform-side). Fixed: SHA format validation, repo-required check at deploy time, clone reason logged, Build configuration UI (repo URL/build/run/port/health) + resilient project page. Dockerfile now OPTIONAL: buildpack-lite generates one for Node/Python from build/run config (custom Dockerfiles still respected). Suite at 78/78. |
| 2026-10-04 | S-003 logging applied (backend + worker): JSON lines, LOG_LEVEL, per-API access log (method/route/status/latency/requestId/user/project), outcome logs (auth/deploy/webhook/shell/project/member), pipeline stage + worker pickup logs, boot summary. Verified live with matching requestIds. Suite at 80/80. |
| 2026-10-04 | Commit SHA now optional: omitted SHA resolves latest branch commit (GitHub API when linked, else `git ls-remote` incl. private repos via token). Garbage SHAs still rejected; unreachable repos → `cannot_resolve_branch`. Suite at 81/81. |
| 2026-10-04 | #519/#520 root-caused: dockerode `followProgress` swallows build-step failures (phantom IMAGE_CREATED → 404 at start). Fixed with `buildErrorOf` scan (proven live: `RUN exit 1` now rejects); empty build command now skips the RUN step; pure-static repos (no package.json) get single-stage nginx. Suite at 92/92. |
| 2026-10-04 | #433 SUCCESS but live URL dead (no Traefik locally — expected, now explicit): app verified reachable direct (container 3001→host 54121). `host_port` now persisted on instances + exposed as `direct_url` on deployment detail + shown in UI with Traefik note. Suite at 82/82. |
| 2026-10-04 | Traefik set up locally (`shipyard-traefik`, restart policy, ensured by `start-local.ps1`): `*.shipyard.localhost` resolves to 127.0.0.1 on Windows; `http://test6.shipyard.localhost/api/health` → 200 through Traefik. Root cause of initial 404s: `traefik:v3.0` predates Docker 29 API (empty daemon errors) — pinned `traefik:v3` in code, script, and both compose files. |
| 2026-10-04 | S-001 UI pass applied: Render-style sidebar shell, dark/light theme toggle (persisted, no-flash), shared UI kit, all 12 routes restyled. Frontend lint + build green. |
| 2026-10-04 | Live deployment links added: shown on /projects page list (live ↗ badge per project with deployed app) and on project overview page (live ↗ link with URL). S-012 (cpu/memory adjustable) also applied. Suite at 97/97; frontend lint+build green; backend 97/97 passing. |
| 2026-10-04 | S-004–S-009 batch applied: overview API + dashboard overhaul, SVG graphs + collapsible requests, project tabs + left panel, runtime stats (CPU/mem/disk/net), delete project, deploy latest, redeploy. Suite at 97/97; frontend lint+build green. |
| 2026-10-04 | P01 → IN PROGRESS (auth/projects/GitHub). Aiven MySQL 8.4.8 confirmed reachable. |
