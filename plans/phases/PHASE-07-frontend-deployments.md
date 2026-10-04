# Phase 07 (PROPOSED) — Frontend (Static) vs Backend (Server) Deployments

**Status:** `PROPOSED — awaiting approval`
**Source:** user request 2026-10-04 ("two types of deployment, frontend needs no server/health check")

## 1. Answer to the question

Correct: a static frontend (React/Vite/Next-export build output) needs no app server
and no `/health` endpoint from user code. ShipYard can serve the built files with
nginx and treat HTTP 200 on `/` as healthy. Backend/service deployments keep the
current behavior (user server + configured health check). So: **two deployment
flavors, one pipeline with a branch.**

## 2. Objective

`projects.deploy_type`: `server` (current behavior, default) vs `static` (build →
nginx serves output dir → no user health endpoint required).

## 3. Design

### 3.1 Type selection + detection
- Explicit `deploy_type` on project (UI selector, defaults `server` = backward compatible).
- `output_dir` field (default `build`, accepts `dist`, `out`, etc.).
- Auto-suggest: if repo has `package.json` + known static markers and no server
  files (`server.js`, `app.py`), UI suggests `static` (suggestion only, user decides).

### 3.2 Static pipeline branch
1. Clone + checkout (unchanged).
2. Run `build_command` inside docker build (generated Dockerfile, as today).
3. Generated static Dockerfile (multi-stage):
   ```
   FROM node:20-alpine AS build  → install + <build_command>
   FROM nginx:alpine → COPY --from=build /app/<output_dir> /usr/share/nginx/html
   EXPOSE 80
   ```
4. Start container, port 80.
5. Health: probe `GET /` expecting 200 (nginx serves `index.html`; no user endpoint needed).
   Record health check with `expected_status 200, path /` regardless of project setting.
6. Route + `SUCCESS` (unchanged).

### 3.3 Server branch (unchanged)
Current behavior: user Dockerfile or generated Node/Python server image, probe
configured `healthcheck_path`, app port from config.

### 3.4 Custom Dockerfile + static
If repo has its own Dockerfile, `deploy_type` is ignored (custom wins, as today).

## 4. Changes

- **DB (migration 007):** `projects.deploy_type ENUM('server','static') DEFAULT 'server'`,
  `projects.output_dir VARCHAR(255) DEFAULT 'build'`.
- **API:** `PATCH /api/projects/:id` accepts both (validated: `output_dir` no `..`/absolute paths);
  deployment detail includes resolved `deploy_type`.
- **Pipeline (`deploymentWorker.js`):** after Dockerfile resolution, if `custom` → current flow;
  if `generated` + `deploy_type=static` → write static nginx Dockerfile instead of server one.
  `dockerfile.js`: new `generateStatic({ outputDir })`.
- **Health:** static branch forces path `/`/200 (logged in timeline so it's visible, not magic).
- **Frontend:** type selector + output-dir input in Build configuration; deploy form unchanged;
  deployment detail shows flavor badge.
- **Validation:** `output_dir` traversal guard; nginx 404-spa fallback note (SPA routing needs
  `try_files` — Phase 07 ships a default SPA-friendly nginx conf, documented).

## 5. Tests
- Unit: `generateStatic` content (nginx stages, output dir, EXPOSE 80); `output_dir` validation rejects `..`, absolute.
- Pipeline (fakes): static project with `deploy_type=static` reaches SUCCESS via generated nginx Dockerfile; server project unchanged.
- Integration: deploy-type persisted through create/patch; deployment records resolved type.
- Live (needs Docker, available): deploy the 2048 repo as `static` end-to-end (it is the canonical case).

## 6. Acceptance criteria
- [ ] 2048-style static repo deploys with only: repo URL + build command + `static` + output dir. No Dockerfile, no health endpoint in user code.
- [ ] Server deployments behave exactly as before (regression suite green).
- [ ] Custom-Dockerfile repos unaffected.
- [ ] Invalid `output_dir` rejected; health probe for static is visibly `/ → 200` in timeline.

## 7. Risks / non-goals
- SPA deep-link refresh needs nginx `try_files` — included as default conf, documented.
- SSR frameworks (Next.js server mode) are `server` type, not `static` (only `next export` output qualifies) — documented, detection warns.
- Monorepos (frontend in subdir) still need `working_directory` — already supported, unchanged.
- No CDN/caching layer in Phase 07 (nginx only); noted as future.

## 8. Alternatives considered
- **Buildpacks (Paketo):** heavier, daemon-dependent, less transparent than our generated Dockerfiles. Rejected for now.
- **Auto-detect without explicit type:** magic misfires (e.g. Express serving static). Explicit type + suggestion chosen.
