# Deployment (ShipYard itself)

## Local dev (no Docker needed for API + frontend)
```powershell
Copy-Item .env.example .env   # fill DB_*, JWT_SECRET, FRONTEND_URL
.\start-local.ps1             # backend :4000 + frontend :3000 in two windows
```
Needs: Node 20+, MySQL reachable (Aiven or local), Redis optional (worker/rate-limit degraded without).

## Full local stack (needs Docker Desktop running)
```powershell
docker compose -f docker-compose.dev.yml up --build
```
Services: frontend :3000, backend :4000, worker, mysql, redis, traefik :80/:8080, prometheus :9090, loki :3100.
Compose `backend`/`worker` use local DB creds by default; point at Aiven by setting `DB_HOST/DB_SSL=true` in `.env` (compose reads root `.env`).

## Production (`docker-compose.prod.yml`)
- Images built from `backend/`, `worker/`, `frontend/` Dockerfiles.
- MySQL + Redis are **external** (Aiven); no local mysql/redis services.
- Traefik fronts `:80` (`web` entrypoint) with Docker provider; add TLS resolver + wildcard cert for real domains.
- Worker requires Docker socket mount (`/var/run/docker.sock`) — the ONLY component allowed near the socket; user containers never get it.
- Prometheus scrapes `backend:4000/metrics`; Loki/Promtail wiring per your cluster (configs in `prometheus/`, Loki endpoint env).

## CI (`.github/workflows/ci.yml`)
Push/PR runs: backend (`npm ci`, `jest --runInBand --forceExit`, `eslint`) and frontend (`npm ci`, `next lint`, `next build`). Red CI blocks merge — broken builds are never healthy.
