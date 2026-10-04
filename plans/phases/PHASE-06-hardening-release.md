# Phase 06 — Hardening, Full Test Suites & Release

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M20 (integration, E2E, failure, performance tests) + M21 (production hardening, docs, release prep)
**Source:** `plans/MASTER-PROMPT.md` §§ 37, 39, 42–43, 46–49, 51 (full 56-step acceptance)

## 1. Objective

Prove the platform works and ship it: full test pyramid green, failure/concurrency behavior correct, docs synchronized, production-ready release cut.

## 2. Scope

### In scope
- Integration tests (§37): MySQL, Redis, webhook handling, queues, deployment persistence, API endpoints, worker behavior.
- Docker/runtime tests: image creation, startup, env injection, health checks, restart, stop/start, limits, logs.
- E2E (§37 + §51 all 56 steps): account → GitHub → configure → deploy → live URL → logs/metrics/requests → push auto-deploy → history → redeploy → rollback → restart/stop/start → rate limit → shell → authZ isolation → secrets → failure reporting → old-version preservation.
- Failure tests (§37 list, §46): invalid/unavailable repo, bad commit, clone/build/Docker/start/health/webhook/signature/dup failures, worker crash, Redis/MySQL outage, missing env, timeout, exhaustion, unauthorized shell, rate-limit exceeded. Each must leave deployment state correct; platform never loses track of a deployment.
- Concurrency (§47): multi-user/project/deployment, concurrent builds, repeated webhooks, multi-worker; Redis queues/locks, no global mutable state, idempotency where needed.
- Perf (§49) + caching (§48): measure API/DB/queue/build/deploy/log-stream/dashboard latency; add indexes justified by query patterns; evaluate layer caching, dep caching, shallow clones only after measuring.
- Platform hardening: CI gates (§42: install→lint→format→test→build→integration→security; broken = red), structured logs + correlation IDs, OpenTelemetry traces, `/health /ready` + platform metrics (§39).
- Docs (§43): `README.md`, `ARCHITECTURE.md`, `PROJECT_ANALYSIS.md`, `DEVELOPMENT.md`, `DEPLOYMENT.md`, `SECURITY.md`, `API.md`, `OPERATIONS.md`, `TESTING.md`, `DECISIONS/` ADRs — all synchronized with implementation. `docs/PLAN.md` closed out.
- Release: versioned tag, changelog, `docker-compose.prod` or equivalent, runbook (backup/restore MySQL, Redis loss procedure, Traefik TLS, log retention).

### Out of scope
- New product features. Only fixes required by tests/review.

## 3. Tests → evidence
- `npm test`, integration suite (needs compose), E2E script/log, failure matrix results, perf baseline numbers — all recorded in `docs/TESTING.md` + TRACKER evidence column. Per global rule: never claim unexecuted tests passed.

## 4. Acceptance criteria (§51 gate — all must hold)
- [ ] All 56 acceptance steps (MASTER-PROMPT §51) demonstrated on a clean environment.
- [ ] Failure matrix: every §37 failure case maps to correct state + correct UI.
- [ ] Docs complete per §43 file list; ADRs current.
- [ ] CI green; release tag cut.

## 5. Risks
- Flaky Docker-dependent tests in CI → quarantine + retry policy with root-cause notes, not silent skips.
- Perf work ballooning → measure-first rule (§§48–49); optimizations require baseline numbers.
