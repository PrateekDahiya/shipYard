# Project Analysis (M0)

## Starting point
Empty directory with only `plans/MASTER-PROMPT.md` (the 53-section product brief).
No code, no database, no infra — greenfield monorepo designed from the brief.

## Stack (per brief §2, locked in ADR-001)
Next.js + TypeScript + Tailwind (separate frontend service) · Express JS backend ·
MySQL 8.4 (Aiven, TLS) with plain-SQL migrations (ADR-003) · Redis (queues/rate-limit/coordination) ·
Docker runtime (dockerode) · Traefik routing · Prometheus + Loki · OpenTelemetry hooks (deferred to hardening) ·
GitHub OAuth + webhooks · SSE realtime (WS reserved for shell attach).

## Domain (tables today)
`users → projects → {repositories, environment_variables, deployments → {deployment_events, builds, build_logs, health_checks}, application_instances, domains, rate_limit_configs, request_logs} · project_members · github_accounts · shell_sessions · audit_logs · schema_migrations`.

## Control / data plane (§4)
Control: auth, projects, GitHub links, config, env metadata, APIs, audit (`backend/`).
Data: clone/build/image/run/route/health/logs/metrics/shell (`backend/src/{workers,runtime,realtime}` + `worker/` service).
Separation is service-level now; process-level (dedicated build sandbox) is the P06-gated hardening item.

## Risks (live register)
1. No Docker daemon / Redis in dev → runtime paths unproven live (mitigation: fakes + contracts; needs Docker Desktop).
2. Builds run in worker temp dirs, not containers (ADR-004) → sandbox before prod.
3. Secrets depend on operator-set `JWT_SECRET`/`DB_ENV_KEY` (currently unset/invalid in dev `.env`).
4. Unbounded `build_logs`/`request_logs` → TTL before sustained traffic.
5. Single-process SSE bus → Redis pub/sub for multi-worker (P06 backlog).
