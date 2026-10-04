#!/bin/sh
# ============================================================
# ShipYard Startup Script (for Docker runtime)
# Waits for dependencies, runs migrations, starts services
# This is called as the container's CMD
# ============================================================
set -e

# defaults - can be overridden via -e when running the container
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
DB_NAME="${DB_NAME:-shipyard}"
DB_USER="${DB_USER:-shipyard}"
DB_PASS="${DB_PASS:-shipyard}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
API_URL="${API_URL:-http://localhost:${BACKEND_PORT}}"

# MySQL TLS mode - auto, preferred, required, or disabled
MYSQL_TLS_MODE="${MYSQL_TLS_MODE:-auto}"

echo "=== ShipYard Startup ==="
echo "MySQL host: $MYSQL_HOST:$MYSQL_PORT (tls_mode=$MYSQL_TLS_MODE)"
echo "Redis host: $REDIS_HOST:$REDIS_PORT"
echo "Backend port: $BACKEND_PORT"
echo "API URL: $API_URL"

# Helper: run mysql with correct ssl mode flag
mysql_cmd() {
  local ssl_flag=""
  if [ "$MYSQL_TLS_MODE" = "disabled" ]; then
    ssl_flag="--ssl-mode=DISABLED"
  elif [ "$MYSQL_TLS_MODE" = "required" ]; then
    ssl_flag="--ssl-mode=REQUIRED"
  elif [ "$MYSQL_TLS_MODE" = "preferred" ]; then
    ssl_flag="--ssl-mode=PREFERRED"
  else
    # auto: let mysql client decide; often works with --ssl-mode=DISABLED
    # for simplicity in this setup, default to disabled
    ssl_flag="--ssl-mode=DISABLED"
  fi
  mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="root" --password="$MYSQL_ROOT_PASSWORD" $ssl_flag "$@"
}

# ============================================================
# Wait for MySQL
# ============================================================
echo "Waiting for MySQL..."
for i in $(seq 1 60); do
  if mysql_cmd -e "SELECT 1;" > /dev/null 2>&1; then
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
# Wait for Redis
# ============================================================
echo "Waiting for Redis..."
for i in $(seq 1 30); do
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
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
# Ensure database and user exist in MySQL
# ============================================================
echo "Setting up database and user..."
mysql_cmd <<EOF
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME`.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
EOF
echo "Database and user configured."

# ============================================================
# Run Backend Migrations / Setup
# ============================================================
echo "Running backend setup..."
cd /app/backend
if [ -f "package.json" ] && grep -q '"migrate"' package.json; then
  npm run migrate 2>/dev/null || echo "Migration script not found, skipping."
else
  echo "No migration tool detected; assuming migrations already applied."
fi

# ============================================================
# Start Backend
# ============================================================
echo "Starting backend on port $BACKEND_PORT..."
cd /app/backend
NODE_ENV="${NODE_ENV:-production}"
export PORT="$BACKEND_PORT"
export DB_HOST="$MYSQL_HOST"
export DB_PORT="$MYSQL_PORT"
export DB_USER="$DB_USER"
export DB_PASS="$DB_PASS"
export DB_NAME="$DB_NAME"
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