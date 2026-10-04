# Suggestions Inbox

Every user suggestion goes here. When starting work in a related area, check this file first,
apply what fits, and flip the status. Statuses: `OPEN` → `APPLIED` (or `DECLINED` with reason).

| ID | Date (UTC) | Suggestion | Area / Phase | Status | Notes |
|----|------------|------------|--------------|--------|-------|
| S-001 | 2026-10-04 | UI is very bad — needs a full quality pass | Frontend | APPLIED | Full pass 2026-10-04: Render-style sidebar shell, dark/light theme (class-based, persisted, no-flash, OS default), shared StatusBadge/Card/PageHeader/Empty/ErrorBanner + button/input styles, all 12 routes restyled (dashboard cards, auth cards, project grid + dashboard cards, deployments table + timeline, metrics stat cards, requests table with method/status colors, domains, terminal-style shell). Frontend lint + build green. |
| S-002 | 2026-10-04 | CORS error on frontend calling backend | Backend API / P00–P01 | APPLIED | Added `cors` middleware (`FRONTEND_URL`, default `http://localhost:3000`), covered by `tests/cors.test.js`. |
| S-003 | 2026-10-04 | Use proper logging in backend — must see what is going on: which method call, which API call, with identifier and correlation IDs | Backend observability / P04–P06 | APPLIED | JSON lines + LOG_LEVEL; per-API access log; outcome logs for auth/deploy/webhook/rollback/shell/project/member; pipeline transitions + worker pickup/finish with deploymentId; boot summary. Verified live (matching requestIds across warn+access lines). |
| S-004 | 2026-10-04 | Better filters in requests page + collapsible request list | Frontend requests | APPLIED | Path substring filter added; rows are collapsible showing method/path/status/latency/timestamp detail. |
| S-005 | 2026-10-04 | Graphs in metrics page | Frontend metrics | APPLIED | SVG bar chart (requests/hour) + line chart (avg latency/hour) from new `/metrics/series` API. No chart library dependency. |
| S-006 | 2026-10-04 | Project page tabs: env vars, build commands, rate limiting, activity as tabs; Deployments/Metrics/Requests/Domains/Shell into left panel for projects | Frontend project layout | APPLIED | Project page restructured with tab bar (Overview/Build/Environment/Team/Activity) + sticky left panel with all sub-page links. |
| S-007 | 2026-10-04 | Better dashboard: live projects, top projects list, services, static pages, overall metrics, failed services | Frontend dashboard | APPLIED | Dashboard shows live/failed/needs-attention counts, top projects with status badges, recent failures list. New `/api/overview` endpoint. |
| S-008 | 2026-10-04 | Metrics must include disk/memory (container resource usage) | Observability | APPLIED | New `/api/projects/:id/runtime` endpoint returns CPU%, memory, disk, network I/O from docker stats. Displayed on metrics page. |
| S-009 | 2026-10-04 | Allow deleting projects | Frontend (backend already supports DELETE) | APPLIED | Delete button on project page with confirmation dialog. Backend already had DELETE with container teardown. |
| S-010 | 2026-10-04 | Deploy-latest-commit button on project page | Frontend deployments | APPLIED | One-click deploy latest: resolves latest branch commit automatically (via git ls-remote/backend) and creates deployment. Backend already supports omitted-SHA create. Pure UI. |
| S-011 | 2026-10-04 | Redeploy button on each history deployment | Frontend deployments | APPLIED | Per-row redeploy action re-creating a deployment from that commit. Reuses rollback endpoint semantics. Pure UI on existing APIs. |

| S-012 | 2026-10-04 | Make memory and disk adjustable per project in advanced settings | Frontend build config | APPLIED | Added cpu_limit and memory_limit fields to project build configuration on project page. Backend already supported `cpu_limit`/`memory_limit` on projects via PATCH `/api/projects/:id`. Fields accept human-readable (512M, 1G) or byte values. Save validates via `parseCpu`/`parseMemory` utils. |

## How to add

Append a row with the next ID (`S-003`, …), date, verbatim suggestion, area/phase, and `OPEN`.
