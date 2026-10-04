# ShipYard

Self-hosted application deployment platform (Render/Heroku-style, self-hosted, always-on).

## Status

Phases 00–05 tested and working (see `plans/TRACKER.md`); Phase 06 hardening in progress.
Docs: `docs/API.md`, `docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/SECURITY.md`.

## Quick start (dev)

Easiest (Windows, keeps windows open so you can browse progress):

```powershell
.\start-local.ps1
# frontend http://localhost:3000, backend http://localhost:4000/health
```

Manual alternative:

1. Copy env: `Copy-Item .env.example .env`
2. Either use external MySQL via `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME` in `.env` (`DB_SSL=true` for Aiven), or run local infra: `docker compose -f docker-compose.dev.yml up`
3. Backend: `cd backend; npm install; npm test; npm start` → `GET http://localhost:4000/health`
4. Frontend: `cd frontend; npm install; npm run dev` → `http://localhost:3000`

## Layout

- `frontend/` — Next.js + TypeScript + Tailwind dashboard (12 routes: dashboard, auth, projects, deployments, metrics, requests, domains, shell, team)
- `backend/` — Node.js + Express (JS) API (`src/config controllers routes services repositories middleware deployment workers queues integrations runtime monitoring realtime utils`)
- `worker/` — deployment worker (Redis queue loop → shared pipeline)
- `docs/` — architecture, API, operations, deployment, testing, security, decisions
- `plans/` — phased implementation plans + tracker
- `SUGGESTIONS.md` — user suggestion inbox (S-001 UI pass, S-003 logging)

## Security

Real credentials live only in `.env` (gitignored) or the environment. Never commit secrets.
