# Phase 03 — Configuration, History, Automation & Safe Release

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M9 (env vars, secrets, runtime config) + M10 (history, status, dashboard) + M11 (auto webhook deploy) + M12 (rollback, zero/minimal downtime)
**Source:** `plans/MASTER-PROMPT.md` §§ 10 (webhook verify), 20–24, 41 (partial)

## 1. Objective

Deployments become operable and safe: secrets handled correctly, full history UI, push-to-deploy automation, rollback-as-new-deployment, and new-version-first traffic switching.

## 2. Scope

### In scope
- Env vars (§20): create/update/delete, masking, runtime + build-time injection flags, redeploy-on-change prompt, encryption-at-rest decision (ADR; at minimum column-level encrypt or documented deferral), secret redaction in all logs.
- History (§21): immutable deployment records (id, SHA, branch, message, author, triggered-by/type, timestamps, duration, status, build/runtime info); Deployment #43-from-#40 model for rollback (§22) — never mutate old rows, never delete history on rollback.
- Webhook auto-deploy (§§10, 23, 11-flow): `POST /api/github/webhook` with HMAC signature verification, project resolution, commit extraction, idempotency (same repo+SHA → no duplicate), queue deployment, live progress in dashboard. Reject unverified/duplicate payloads with correct codes.
- Rollback + zero-downtime (§§22, 24, 12-flow): `POST /api/deployments/:id/rollback` creates new deployment from old commit; swap order old→new-healthcheck→route→stop-old; failed new version preserves healthy old version.
- Lifecycle actions: Cancel (queued/running), Restart, Stop/Start (§35 routes).
- Frontend: Deployments history table, deployment detail (timeline + logs link), Rollback/Cancel/Restart/Open-app actions, Env editor with secret masking + redeploy nudge, auto-deploy toggle per project.
- Audit: `deployment.created/cancelled/rollback`, `application.started/stopped/restarted`, `environment.updated`.

### Out of scope
- Realtime WS streaming (Phase 04 — polling acceptable here), metrics/requests UI, rate limiting, shell, custom domains.

## 3. Files (expected)
```
backend/src/{routes/{deployments.js,webhooks.js},services/{envService.js,rollbackService.js,webhookService.js},
 deployment/swap.js,middleware/projectAccess extensions}
frontend/app/projects/[id]/{deployments,deployments/[depId],environment}
```

## 4. Database
- Extend `environment_variables` (encrypted value column, `is_secret`, `scope build|runtime|both`); `deployments(trigger_type, triggered_by, rollback_of)`; dedupe index `deployments(project_id, commit_sha, trigger_type)` advisory + idempotency key table or Redis dedupe key.
- Transactions for rollback-create + event log.

## 5. API delta
```
POST /api/deployments/:id/rollback  POST /api/deployments/:id/cancel
POST /api/github/webhook (public, HMAC-guarded)
```

## 6. Tests
- Unit: secret redaction, webhook signature verify, dedupe logic, rollback-creates-new-row invariant.
- Integration: push event → verified → deployment queued; bad signature → 401 + no deployment; duplicate delivery → single deployment; rollback → new deployment with source SHA; failed new version keeps old serving.
- E2E (§51 steps 32–44 subset): push commit → auto deploy → traffic switched → history → rollback → restart/stop/start.

## 7. Acceptance criteria
- [ ] Secrets never appear in any API response or persisted log (test asserts).
- [ ] Duplicate webhook delivery creates exactly one deployment.
- [ ] Rollback creates a new deployment row; history intact.
- [ ] New-version health failure leaves old version serving.

## 8. Risks
- Webhook replay/dup storms → idempotency key + Redis lock.
- Env encryption scope → explicit ADR if deferred; must not block this phase but must be documented.
