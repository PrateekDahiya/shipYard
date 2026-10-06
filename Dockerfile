# ============================================================
# ShipYard — Production Dockerfile
# Complete setup on server: builds & runs backend + frontend.
# MySQL is external (e.g. Aiven). Redis and Traefik must be available
# as Docker services on the same network, or running on the host.
# ============================================================
FROM node:20-alpine

# Install tini for proper signal handling and mysql-client for health checks
RUN apk add --no-cache tini bash mysql-client

# Create app user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# ---- Copy entire repository explicitly ----
COPY backend ./backend
COPY frontend ./frontend
COPY docker-compose.dev.yml ./docker-compose.dev.yml
COPY docker-compose.prod.yml ./docker-compose.prod.yml
COPY start-local.ps1 ./start-local.ps1
COPY start-shipyard.sh ./start-shipyard.sh
COPY .env.example ./.env.example

# ---- Install dependencies ----
# Backend
WORKDIR /app/backend
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev 2>/dev/null || true

# Frontend
WORKDIR /app/frontend
RUN npm ci 2>/dev/null || npm install 2>/dev/null || true

# ---- Build ----
# Backend (skip if no build script)
RUN npm run build 2>/dev/null || echo "Backend build skipped"

# Frontend (Next.js build)
RUN npm run build --prefix frontend 2>/dev/null || echo "Frontend build skipped"

# ---- Runtime configuration ----
# Environment variables are expected to be provided at container start:
#   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS (+ DB_SSL=true and
#     DB_SSL_CA_PATH for managed MySQL like Aiven)
#   - REDIS_HOST, REDIS_PORT
#   - JWT_SECRET, DB_ENV_KEY
#   - FRONTEND_PORT, BACKEND_PORT
#   - API_URL
#   - Traefik will route http://<project>.shipyard.localhost to the backend

# ---- Entrypoint ----
# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Startup script
COPY start-shipyard.sh /usr/local/bin/start-shipyard.sh
RUN chmod +x /usr/local/bin/start-shipyard.sh

# Default command: run the startup script
CMD ["/usr/local/bin/start-shipyard.sh"]