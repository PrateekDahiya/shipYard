# Phase 05 — Advanced Runtime & Security (Shell, Domains, Audit, Hardening)

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M17 (shell) + M18 (custom domains) + M19 (audit logs, security hardening, RBAC)
**Source:** `plans/MASTER-PROMPT.md` §§ 31–32, 34 (full), 40–41

## 1. Objective

Close the security-critical gaps: confined container shell, custom-domain path, complete audit trail, and a milestone-wide security review. Nothing here may weaken Phases 00–04 guarantees.

## 2. Scope

### In scope
- Shell (§31 — security-critical): `POST /api/projects/:id/shell` → exec only in the user's own running container. Auth + project-access check + container validation, session timeout, audit (`shell.started/ended` with user/project/container/times/status), safe terminal transport (WS), session cleanup. Explicit denials: no host shell/filesystem, no Docker socket, no privileged/caps.
- Custom domains (§32): `domains` model + flow design (register → ownership verify → DNS instructions → TLS via Traefik → routing → removal). Ship `*.shipyard` fully; custom domains at least designed + behind flag — do not over-engineer if it blocks core (§32 last line; record scope decision as ADR).
- Audit (§41): all listed events persisted with user/project/action/timestamp/metadata, no secret values. UI surface in Settings or project activity feed.
- Authorization completion (§34): enforce on deploy/rollback/stop/restart/env/shell/domain/logs/metrics; RBAC roles landed or explicitly deferred with migration-safe schema (`project_members.role`).
- Security review (§40): command injection (build/run untrusted), container escape, socket exposure, secrets leakage, path traversal, SSRF (clone URLs/remote resources allowlist), webhook HMAC, authN/Z, resource exhaustion (timeouts/limits), shell confinement, log injection. Fix or file each finding before Phase 06.

### Out of scope
- Full integration/E2E/perf suites and release docs (Phase 06). No new deployment-pipeline features.

## 3. Files (expected)
```
backend/src/{routes/{shell.js,domains.js},services/{shellService.js,domainService.js,auditService.js},
 security/{execGuard.js,pathGuard.js,secretScrub.js}}
frontend/app/projects/[id]/{shell,domains,settings}
```

## 4. Database
- `shell_sessions`, `domains (project_id, hostname unique, verification_token, status, tls_status)`, `audit_logs` completed, `project_members.role` backfill.

## 5. API delta
```
POST /api/projects/:id/shell (+ WS attach)  GET/POST/DELETE /api/projects/:id/domains
GET /api/projects/:id/audit
```

## 6. Tests (security-weighted)
- AuthZ matrix: each privileged action × (owner/member/stranger/anon) → allow/403/401.
- Shell: cross-project container targeting rejected; expired session killed; audit rows written; privileged flags absent on exec.
- SSRF/path traversal/command-injection negative tests; secret-scrub test on logs + audit.
- Domain verification negative (unverified hostname not routed).

## 7. Acceptance criteria
- [ ] Shell works in own container, impossible against another project's container (test-proven).
- [ ] Security review checklist (§40, all 11 items) dispositioned with evidence.
- [ ] Audit covers all §41 actions without secret values.
- [ ] §51 steps 50–52 (restricted shell, authZ isolation, secret hiding) verified.

## 8. Risks
- Shell = highest blast radius → smallest possible exec surface, strict timeouts, session recording metadata only (no keystroke secrets).
- Custom-domain TLS/DNS scope creep → time-box; design-first allowed per §32.
