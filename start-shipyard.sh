#!/bin/sh
# ============================================================
# ShipYard Startup Script (for Docker runtime)
# Waits for dependencies, runs migrations, starts services.
# This is called as the container's CMD (root all-in-one image).
#
# MySQL is EXTERNAL (e.g. Aiven) — this script never creates users or
# databases (managed instances forbid it). It only waits for the DB to
# accept the app credentials, runs `npm run db:migrate`, then starts
# backend + frontend.
# ============================================================
set -e

# DB_* preferred; MYSQL_* kept as fallback for older env files.
DB_HOST="${DB_HOST:-${MYSQL_HOST:-localhost}}"
DB_PORT="${DB_PORT:-${MYSQL_PORT:-3306}}"
DB_NAME="${DB_NAME:-shipyard}"
DB_USER="${DB_USER:-shipyard}"
DB_PASS="${DB_PASS:-shipyard}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
API_URL="${API_URL:-http://localhost:${BACKEND_PORT}}"

echo "=== ShipYard Startup ==="
echo "DB host: $DB_HOST:$DB_PORT (database: $DB_NAME, user: $DB_USER)"
echo "Redis host: $REDIS_HOST:$REDIS_PORT"
echo "Backend port: $BACKEND_PORT"
echo "API URL: $API_URL"

if [ "${JWT_SECRET:-}" = "" ] || [ "$JWT_SECRET" = "shipyard-jwt-secret-must-change" ]; then
  echo "WARNING: JWT_SECRET is unset or still the placeholder — set a real secret."
fi
if [ "${DB_ENV_KEY:-}" = "" ] || [ "$DB_ENV_KEY" = "shipyard-db-key-must-change" ]; then
  echo "WARNING: DB_ENV_KEY is unset or still the placeholder — env secrets cannot be encrypted."
fi

# ============================================================
# Wait for MySQL (app credentials, no root needed)
# ============================================================
echo "Waiting for MySQL..."
for i in $(seq 1 60); do
  # No --ssl-mode flag: the client negotiates TLS when the server requires
  # it (Aiven) and skips it for plain local servers.
  if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT 1;" > /dev/null 2>&1; then
    echo "MySQL is healthy."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: MySQL did not become healthy after 60 seconds."
    exit 1
  fi
  sleep 1
done

# ============================================================
# Wait for Redis (bash TCP probe — this image has no redis-cli)
# ============================================================
echo "Waiting for Redis..."
for i in $(seq 1 30); do
  if (echo > /dev/tcp/"$REDIS_HOST"/"$REDIS_PORT") > /dev/null 2>&1; then
    echo "Redis is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Redis did not become healthy after 30 seconds."
    exit 1
  fi
  sleep 1
done

# ============================================================
# Run Backend Migrations
# ============================================================
echo "Running backend migrations..."
cd /app/backend
if [ -f "package.json" ] && grep -q '"db:migrate"' package.json; then
  npm run db:migrate
else
  echo "No db:migrate script detected; assuming migrations already applied."
fi

# ============================================================
# Start Backend
# ============================================================
echo "Starting backend on port $BACKEND_PORT..."
cd /app/backend
NODE_ENV="${NODE_ENV:-production}"
export PORT="$BACKEND_PORT"
export DB_HOST="$DB_HOST"
export DB_PORT="$DB_PORT"
export DB_USER="$DB_USER"
export DB_PASS="$DB_PASS"
export DB_NAME="$DB_NAME"
export DB_SSL="${DB_SSL:-false}"
export DB_SSL_CA_PATH="${DB_SSL_CA_PATH:-}"
export REDIS_HOST="$REDIS_HOST"
export REDIS_PORT="$REDIS_PORT"
export API_URL="${API_URL}"

# Set required env vars if not already
export JWT_SECRET="${JWT_SECRET:-shipyard-jwt-secret-must-change}"
export DB_ENV_KEY="${DB_ENV_KEY:-shipyard-db-key-must-change}"

# Start backend in background
node src/server.js &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# ============================================================
# Start Frontend (serve .next)
# ============================================================
echo "Starting frontend on port $FRONTEND_PORT..."
cd /app/frontend
export PORT="$FRONTEND_PORT"
export NEXT_PUBLIC_API_URL="${API_URL}"

# Start frontend in background using next start
npx next start -p "$FRONTEND_PORT" &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

echo "=== ShipYard is running ==="
echo "Backend (API):  http://localhost:${BACKEND_PORT}"
echo "Frontend UI:    http://localhost:${FRONTEND_PORT}"
echo "Press Ctrl+C to stop, or use: docker stop <container>"

# ============================================================
# Wait for termination
# ============================================================
echo "ShipYard processes running (PIDs: Backend=$BACKEND_PID, Frontend=$FRONTEND_PID)"
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Keep container running until killed
while true; do
  sleep 10
  # check if processes are still alive
  if ! kill -0 $BACKEND_PID 2>/dev/null || ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "One or more processes has exited."
    break
  fi
done
