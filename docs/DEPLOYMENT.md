# Deployment (ShipYard itself)

## Local dev (no Docker needed for API + frontend)
```powershell
Copy-Item .env.example .env   # fill DB_*, JWT_SECRET, FRONTEND_URL
.\start-local.ps1             # backend :4000 + frontend :3000 in two windows
```
Needs: Node 20+, MySQL reachable (Aiven), Redis reachable (local container or
managed). Redis is **required** — the worker queue, rate limiting, and the
realtime log/event bridge all run on it. Pick either this script or the compose
stack below, never both (same ports).

## Full local stack (needs Docker Desktop running)
```powershell
docker compose -f docker-compose.dev.yml up --build
```
Services: frontend :3000, backend :4000, worker, redis, traefik :80/:8080.
(`prometheus` exists only in `docker-compose.prod.yml`, where it scrapes
`backend:4000/metrics`. There is no local MySQL/Loki service — MySQL is
external via `DB_HOST` in `.env`, `DB_SSL=true` for Aiven.)
Run migrations first when pointing at a fresh database:
`cd backend; npm run db:migrate`. Recreate containers to apply compose changes:
`docker compose -f docker-compose.dev.yml up -d --force-recreate`.

## Production (`docker-compose.prod.yml`)
- Images built from `backend/`, `worker/`, `frontend/` Dockerfiles.
- MySQL + Redis are **external**; no local mysql/redis services.
- Traefik fronts `:80` (`web` entrypoint) with Docker provider; add TLS resolver + wildcard cert for real domains.
- Worker requires a read-write Docker socket mount (`/var/run/docker.sock`) — it
  creates containers. Backend mounts the same socket **read-only** for live
  container stats and logs; user containers never get it.
- Every compose service is capped at `mem_limit: 1g`.
- Single-container alternative: build the root `Dockerfile` (backend + frontend
  via `start-shipyard.sh`); it needs external MySQL/Redis and runs migrations
  with `npm run db:migrate`.

## CI (`.github/workflows/ci.yml`)
Push/PR runs: backend (`npm ci`, `jest --runInBand --forceExit`, `eslint`) and frontend (`npm ci`, `next lint`, `next build`). Red CI blocks merge — broken builds are never healthy.
