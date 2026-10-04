# ShipYard API Reference

Base URL: `http://localhost:4000` (dev). Auth: `Authorization: Bearer <jwt>` unless noted.
Every response includes `requestId`. Errors: `{ error: <code>, requestId }`.

## Auth — `POST /api/auth/register|login|logout`, `GET /api/auth/me` (auth)
Register: `{ email, password (min 8), name? }` → 201 `{ user, token }`.
Login: `{ email, password }` → 200. `me` → current user (no password hash).

## Projects — `/api/projects` (auth; `:id` routes require membership)
- `GET /` — own + member projects. `POST /` — `{ name*, branch?, build_command?, run_command?, app_port?, ... }` → 201.
- `GET|PATCH|DELETE /:id` — PATCH accepts config fields + `cpu_limit`/`memory_limit` (validated, 400 on bad values) + `auto_deploy`.
- Env: `GET /:id/env` (secrets masked) · `POST /:id/env` `{ key*, value*, is_secret?, scope? }` · `DELETE /:id/env/:key`.
- GitHub link: `POST /:id/github/link` `{ github_repo_id*, full_name*, default_branch? }` → includes `webhook_secret`.
- Webhook config: `GET /:id/webhook-config` → `{ webhookUrl, linked, repository, secret }`.
- Audit: `GET /:id/audit` (no secret values, ever).
- Members: `GET /:id/members` · `POST /:id/members` `{ email*, role: admin|developer|viewer }` (admin needs owner) · `DELETE /:id/members/:userId`.

## Deployments — `/api/projects/:id/deployments` (auth + membership)
- `POST /` — `{ commitSha?, branch?, previousDeploymentId? }` (SHA required unless GitHub-linked for branch-latest) → 201 `{ deployment (QUEUED), queued }`. `queued:false` means Redis is down; the worker picks it up later.
- `GET /` — history (newest first). `GET /:depId`, `/logs`, `/events`.
- `POST /:depId/cancel` → terminal `CANCELLED` (409 if already terminal).
- `POST /:depId/rollback` → 201 **new** deployment from that commit (`trigger_type=rollback`, `rollback_of` set).
- Lifecycle: `POST /:id/start|stop|restart` (409 when nothing to act on).

## GitHub — `/api/github` (auth except webhook)
- `GET /status`, `GET /auth-url`, `POST /oauth/callback { code }`, `GET /repos`, `GET /repos/:owner/:repo/branches`, `GET /repos/:owner/:repo/commits?sha=`.
- `POST /webhook` (PUBLIC, raw body): GitHub push events. HMAC-SHA256 (`X-Hub-Signature-256`) required for linked repos; unknown repos/events → 200 ignored; `auto_deploy` off → 200 skipped; live duplicate SHA → 200 duplicate.

## Observability — `/api/projects/:id/*` (auth + membership)
- `GET /events?token=<jwt>` — SSE stream (`connected`, `DEPLOYMENT_CREATED`, `DEPLOYMENT_STATUS`, `DEPLOYMENT_LOG` + heartbeats).
- `GET /metrics` — deployments by status, durations, request totals/errors (all real data).
- `GET /requests?method=&status=&path=` — metadata only (no bodies/query strings).
- `GET|PUT /rate-limit` — `{ requests_per_minute, requests_per_hour, enabled }`; exceeded → 429 + `Retry-After`.

## Shell — (auth + membership)
- `POST /:id/shell` → 201 `{ session, attachUrl }` (409 without RUNNING instance).
- `DELETE /:id/shell/:sessionId` — close (own sessions; 403 otherwise).
- `WS /api/projects/:id/shell/:sessionId/attach?token=` — terminal attach, 15-min TTL, audited.

## Domains — (auth + membership)
- `GET|POST /:id/domains` (`{ hostname* }` → 201 `{ domain, verificationToken }`; 400 bad host, 409 taken).
- `POST /:id/domains/:domainId/verify` — checks DNS TXT `shipyard-verification=<token>`.
- `DELETE /:id/domains/:domainId`.

## Platform
- `GET /health` → 200 (no deps). `GET /ready` → 200/503 with `{ db, redis }` checks.
- `GET /metrics` — Prometheus scrape (HTTP counts/latency, deployment triggers/outcomes).
