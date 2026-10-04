# Phase 04 — Observability: Realtime, Metrics, Requests & Rate Limiting

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M13 (realtime logs, WS/SSE) + M14 (metrics, Prometheus) + M15 (request monitoring) + M16 (rate limiting)
**Source:** `plans/MASTER-PROMPT.md` §§ 25–29, 36, 39 (partial)

## 1. Objective

Users can watch what's happening live and understand app behavior: streaming logs/events, Prometheus metrics, request inspector, and per-project rate limits.

## 2. Scope

### In scope
- Realtime (§§26, 36): WS (preferred) or SSE channel for `DEPLOYMENT_CREATED, BUILD_STARTED, BUILD_LOG, BUILD_COMPLETED, CONTAINER_STARTING, HEALTH_CHECK_STARTED/PASSED, DEPLOYMENT_COMPLETED/FAILED` + container state/health/runtime events. Auth-scoped subscriptions (only authorized project events). Loki remains the log store (§25); WS streams + persists with `{timestamp, project, deployment, container, severity, source}` metadata.
- Log pages (§§6, 25): build/runtime/deployment/system logs with live streaming, timestamps, filter, severity, search. No sensitive bodies by default.
- Metrics (§27, M14): Prometheus instrumentation — app (CPU/mem/uptime/restarts/state), HTTP (count/rate/latency/error-rate/status/size), deployment (counts, success/fail, durations), platform (queue size/latency, worker utilization, API latency/error). Frontend Metrics pages with real queries only (§45 — no fake charts).
- Request monitoring (§28, M15): capture via routing layer/instrumentation `{timestamp, project, deployment, method, path, status, latency, size}`; filters (time/method/status/path/deployment); strip bodies + sanitize query params that may carry secrets.
- Rate limiting (§29, M16): Redis-backed, project-configurable (e.g. 100/min, 1000/hr), documented algorithm ADR (recommend token-bucket or sliding-window + why), 429 responses, project-level config UI + API.
- Self-monitoring (§39 subset): `/health /ready`, API latency/errors, queue size, deployment throughput/failures, DB/Redis latency, structured logs + request/correlation IDs, OpenTelemetry hooks where practical.

### Out of scope
- Shell, custom domains, audit/RBAC hardening, full E2E/perf suites (Phase 05/06).

## 3. Files (expected)
```
backend/src/{realtime/{gateway.js,events.js},monitoring/{prometheus.js,requestLogger.js},
 middleware/rateLimit.js,services/metricsService.js}
frontend/app/projects/[id]/{logs,metrics,requests} + realtime hooks/components
prometheus/prometheus.yml  loki/loki-config.yml
```

## 4. Database / Stores
- `request_logs` (or Loki + sampled DB index — decide via ADR; default DB table with TTL/partitioning note + indexes on `(project_id, timestamp)`, `(status)`); `rate_limit_configs`.
- Redis: rate-limit counters, WS presence/coordination. Not primary persistence (§2).

## 5. API delta
```
GET /api/projects/:id/logs (filter+cursor)   WS /api/projects/:id/events
GET /api/projects/:id/metrics (Prometheus-backed)  GET /api/projects/:id/requests (filtered)
GET/PUT /api/projects/:id/rate-limit
```

## 6. Tests
- Unit: event model, log redaction, rate-limit algorithm (burst + refill), request sanitizer.
- Integration: deploy emits full event sequence; unauthorized WS join rejected; Prometheus scrapes app + platform metrics; rate limit trips → 429 with headers.
- Frontend: logs stream without reload; metrics render real query results; request filters work.

## 7. Acceptance criteria
- [ ] Live deployment shows log lines + state events without page reload.
- [ ] Metrics/Requests pages show real data for a deployed app; empty states honest when no traffic.
- [ ] Rate limit configured at 100/min demonstrably 429s excess traffic.

## 8. Risks
- WS fan-out + auth at scale → room-per-project + token check on handshake; load test deferred to Phase 06.
- High-cardinality Prometheus labels / request-log volume → bounded labels + retention/TTL policy ADR.
