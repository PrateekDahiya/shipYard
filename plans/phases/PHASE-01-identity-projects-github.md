# Phase 01 — Identity, Projects & GitHub Connection

**Status:** `PLANNED — awaiting review`
**Milestones covered:** M2 (auth/users/sessions) + M3 (projects/config/DB model) + M4 (GitHub OAuth, repo/branch/commit selection)
**Source:** `plans/MASTER-PROMPT.md` §§ 5–6 (partial), 9–10, 33–35 (partial), 41 (partial)

## 1. Objective

A logged-in user can create a project, connect GitHub, pick repo/branch/commit, and configure build/run settings — without deploying anything yet.

## 2. Scope

### In scope
- Auth (§33): registration/login/logout, session or token handling, password hashing (bcrypt/argon2), logout invalidation, GitHub account association model. No plaintext passwords, no token leakage to frontend.
- Authorization foundation (§34): `project_members` + ownership check middleware; every project route enforces access; RBAC-ready (`Owner/Admin/Developer/Viewer` enum reserved, only Owner enforced now).
- Projects (§§9, 35): CRUD `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`; project config fields from §12 (repo, branch, build/run cmd, workdir, port, healthcheck path/timeout, timeouts, CPU/mem limits, rate-limit stub, auto-deploy flag).
- GitHub (§10): OAuth flow, list repos/branches/commits via GitHub API, store `github_accounts`, `repositories` linkage. Webhook *creation* UI/endpoint may exist but auto-deploy execution is Phase 03 — only persist webhook config + signature secret here.
- Frontend: Login/Register, Dashboard (real counts only), Project List, Project Overview shell, Settings + Environment (read/edit UI backed by real API), GitHub connect + repo/branch/commit pickers.
- Audit: `project.created/updated`, `environment.updated` events (§41).

### Out of scope
- Deployment execution, workers, Docker, Traefik routing, build logs, webhooks firing deployments (deferred to Phase 02/03).

## 3. Files (expected)
```
backend/src/{routes/auth.js,routes/projects.js,routes/github.js,
 controllers/,services/authService.js,services/projectService.js,services/githubService.js,
 integrations/github.js,middleware/auth.js,middleware/requireProjectAccess.js,
 repositories/{userRepo,projectRepo,githubRepo}}
frontend/app/{login,register,dashboard,projects/[id]/{overview,settings,environment}}
```

## 4. Database (§8 incremental)
Tables this phase only:
`users, github_accounts, projects, project_members, repositories, environment_variables (metadata only — injection in Phase 03), audit_logs`.
FKs, unique constraints (`projects` per-user name unique; `project_members(user,project)` unique), indexes on `projects(owner_id)`, timestamps. Migration scripts + seed for dev.

## 5. API delta (adapt §35, don't blindly copy)
```
POST /api/auth/register|login|logout  GET /api/auth/me
GET/POST /api/projects  GET/PATCH/DELETE /api/projects/:id
GET /api/projects/:id/env  POST /api/projects/:id/env  PATCH/DELETE /api/projects/:id/env/:key
GET /api/github/repos  GET /api/github/repos/:id/branches  GET .../commits
POST /api/projects/:id/github/link
```
Secrets: env values masked on read; never log secrets (§20).

## 6. Tests
- Unit: validation, auth hashing, authorization middleware (owner vs stranger vs logged-out), config parsing.
- Integration: auth flow + project CRUD + GitHub link with mocked GitHub API; MySQL persistence; unauthorized cross-project access = 403.
- Failure: bad credentials, duplicate project name, invalid repo link, expired session.

## 7. Acceptance criteria
- [ ] Register → login → create project → link GitHub repo → pick branch/commit → save build config works against real MySQL.
- [ ] Cross-user project access denied; secrets masked in API + logs.
- [ ] Dashboard shows real counts (no fake charts per §45).

## 8. Risks
- GitHub OAuth app setup complexity → support PAT fallback for dev, document it.
- Scope creep into deployments → hard boundary: no `deployments` table yet.
