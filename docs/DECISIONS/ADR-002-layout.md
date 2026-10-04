# ADR-002 — Repo layout

Monorepo: `frontend/`, `backend/src/{config,controllers,routes,services,repositories,middleware,models,workers,queues,integrations,deployment,runtime,monitoring,logging,security,utils}`, `worker/`, `docs/`, `plans/`, `docker-compose.dev.yml`. Controllers coordinate, services hold logic, repositories handle persistence. No business logic in route handlers.
