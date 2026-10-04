# Plans Index

- Spec (source of truth): `MASTER-PROMPT.md` — full ShipYard brief, milestones M0–M21, 56-step acceptance test.
- Progress tracker: `TRACKER.md` — review/approval status, per-phase checklist, evidence log.
- Phased implementation plans: `phases/`
  - `PHASE-00-foundation-planning.md` — M0+M1: architecture, scaffolding, `docker-compose.dev.yml`, CI + docs skeleton.
  - `PHASE-01-identity-projects-github.md` — M2+M3+M4: auth, projects, GitHub OAuth/repo/branch/commit, env UI.
  - `PHASE-02-deployment-engine-core.md` — M5+M6+M7+M8: queue→worker→clone→build→Docker→health→Traefik live URL.
  - `PHASE-03-lifecycle-automation.md` — M9+M10+M11+M12: secrets handling, history, webhook auto-deploy, rollback + zero-downtime.
  - `PHASE-04-observability.md` — M13+M14+M15+M16: realtime WS/SSE, Prometheus metrics, request logs, rate limiting.
  - `PHASE-05-security-advanced.md` — M17+M18+M19: container shell, custom domains, audit + security review + RBAC.
  - `PHASE-06-hardening-release.md` — M20+M21: full test pyramid, failure/concurrency/perf, docs sync, release cut.

**Workflow:** review `TRACKER.md` + `phases/` → approve or request changes → only then does execution begin.
