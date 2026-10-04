# Development

## Prerequisites

Node 20+, npm, Docker + Compose.

## Env

`Copy-Item .env.example .env` — fill `DB_*` for Aiven (`DB_SSL=true`) or leave defaults for compose-local MySQL/Redis.

## Services

```powershell
docker compose -f docker-compose.dev.yml up
```

## Backend

```powershell
Set-Location backend; npm install; npm test; npm start
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/ready
```

`/ready` returns 503 when MySQL/Redis are unreachable — expected until infra is up.

## Frontend

```powershell
Set-Location frontend; npm install; npm run dev
```

## Worker

Placeholder (Phase 00): `Set-Location worker; npm install; npm start`.
