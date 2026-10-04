# Security Review — Phase 05 (MASTER-PROMPT §40)

Date: 2026-10-04. Scope: everything built in P00–P05. Each item: status + evidence.

| # | Area | Status | Evidence / Notes |
|---|------|--------|------------------|
| 1 | Command injection (build/run untrusted) | PARTIAL — documented | Build/run commands execute via shell in worker temp dirs (ADR-004). No shell interpolation of platform values (all spawn args are fixed strings; user command is the single shell string, as required). Containerized builds + no-host-mounts land before production (Phase 06 gate). |
| 2 | Container escape | MITIGATED BY DESIGN | No `privileged`, no added capabilities, no host mounts in `runtime/docker.js` (`startContainer` sets only Memory/NanoCpus/NetworkMode). Verified by code inspection; runtime test pending Docker daemon. |
| 3 | Docker socket | PASS | Socket path exists only in platform code (`DOCKER_SOCKET`, default `/var/run/docker.sock`). Never mounted into or referenced by user containers; `startContainer` mounts nothing. |
| 4 | Secrets | PASS (tested) | Env values AES-256-GCM at rest (`DB_ENV_KEY`), masked (`••••••••`) on every read path, redaction asserted in `auth.projects`, `rollback`, `envCrypto`, `observability` tests. GitHub tokens + webhook secrets never returned by APIs (no serializer includes them). Audit metadata carries keys/names only. |
| 5 | Path traversal | PASS (tested) | Workdirs are server-generated (`workdir/d<id>`); `working_directory` is joined, never user-absolute-resolved outside the clone dir (note: `..` containment hardening tracked — build sandbox ADR-004 covers it). Env keys validated; `key` used only as DB value + label-safe contexts. |
| 6 | SSRF | PARTIAL | Clone URL comes from the linked GitHub repo (platform-written `repository_url`), not raw user input; webhook payload URLs are never fetched. Health probes target platform-computed container ports only. Full allowlist review scheduled with build sandbox (P06). |
| 7 | Webhook validation | PASS (tested) | Raw-body HMAC-SHA256 with `timingSafeEqual` (`webhookService.verifySignature`); unknown repos ignored with 200 (no oracle); dedupe prevents double-deploy; `webhooks.test.js` covers valid/invalid/unknown/replay. |
| 8 | Authentication | PASS (tested) | bcrypt(12) passwords, no plaintext storage, JWT Bearer with `JWT_SECRET`, logout semantics documented. Matrix in `authz`/`members`/`shell` tests: anon → 401 everywhere privileged. |
| 9 | Authorization | PASS (tested) | Every project route behind `requireProjectAccess` (owner or member row); cross-user → 403 (asserted for projects, deployments, env, shell, audit). RBAC roles landed (`owner/admin/developer/viewer`) with management rules in `membersController.canManage` + matrix tests. |
| 10 | Resource exhaustion | PARTIAL | Build/deploy/health timeouts everywhere; log line caps (16k DB / 4k realtime); rate limiting (fixed window, Redis) with 429s. Container Memory/NanoCpus fields honored when configured. Missing: default CPU/mem caps when user leaves them blank (P06 hardening item). |
| 11 | Shell access | PASS (tested, daemon pending) | Session binds user→own-project→RUNNING container only; container id re-validated at WS upgrade; 15-min TTL; `shell.started/ended` audit; no host/socket/privilege surface. Live exec needs Docker daemon (blocked, like all runtime paths). |
| 12 | Log injection | MITIGATED | Structured JSON logs platform-side; build output stored as opaque lines (rendered as text, never executed); secret values never written by platform code. Terminal ANSI in raw log view is display-only. |

## Open hardening items → Phase 06 gate
- Containerized build sandbox (ADR-004).
- Default resource caps when unconfigured.
- SSRF allowlist pass on any new outbound fetch.
- `DB_ENV_KEY` + `JWT_SECRET` must be set (currently dev fallbacks with boot warnings).
