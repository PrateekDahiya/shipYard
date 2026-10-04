# Architecture (current — Phases 00–06)

Source: `plans/MASTER-PROMPT.md` §§3–4.

```
Browser ── Next.js dashboard (12 routes, SSE live tail, WS shell)
  │ REST/SSE/WS
API server (Express JS)
  ├── routes → controllers → services → repositories → MySQL 8.4 (Aiven, TLS)
  ├── Redis: deployment queue (BRPOPLPUSH), fixed-window rate limits
  ├── deployment/ (guarded state machine) · workers/ (clone→build→image→run→health→route)
  ├── runtime/ (dockerode wrapper, health probes, Traefik label router)
  ├── realtime/ (SSE bus, WS shell gateway) · monitoring/ (prom-client)
  └── middleware (requestId, auth, project access, CORS, request log, rate limit)
Worker service ── Redis queue ──► runs same pipeline ──► Docker ──► Traefik ──► user apps
Observability: Prometheus :9090 ← /metrics · Loki :3100 · request_logs + audit in MySQL
```

## Control plane vs data plane

- **Control plane:** users, auth, projects, GitHub links, deployment config, env metadata, dashboard, APIs, deployment requests, audit history. (Phases 01, 03.)
- **Data plane:** checkout, build, image, containers, networking, routing, health checks, runtime logs/metrics/requests, shell. (Phases 02, 04, 05.)

Separation is service-level (`backend/` API + `worker/` deployments, separate
deployables sharing the pipeline module). Process-level build sandboxing is the
documented pre-prod hardening item (ADR-004).

## Standing decisions

- Backend stays JavaScript (Express), separate service from Next.js frontend.
- MySQL via env config with TLS flag for Aiven; local compose MySQL as fallback.
- Plain-SQL migrations (ADR-003); fixed-window rate limiting (ADR-005).
- Redis for queues/coordination only, not primary persistence.
- SSE for dashboard streams, WS only for shell attach.
