# ShipYard Production Readiness Plan
## Using Local Machine (Docker + Redis + MySQL + Traefik)

**Branch**: `production-readiness`
**Commit**: `108f425` - "production readiness: add Dockerfile, startup script, and comprehensive production plan"

---

## Health Check Configuration

### Dockerfile HEALTHCHECK

The Dockerfile includes a HEALTHCHECK instruction that checks the overall container health:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || \
      (mysql_cmd() { mysql --host="127.0.0.1" --user="root" --password="$$MYSQL_ROOT_PASSWORD" --ssl-mode=DISABLED -e "SELECT 1;" >/dev/null 2>&1; }; mysql_cmd) || exit 1
```

**What this does:**
- Runs every 30 seconds
- Times out after 10 seconds if unresponsive
- Waits 40 seconds before first check (gives startup time)
- Retries 3 times before marking container unhealthy
- Checks: 
  1. Backend API at `/api/health` endpoint (HTTP 200)
  2. MySQL database connectivity (with TLS disabled for Docker setups)
- Marks container unhealthy if both checks fail

**Note**: The TLS mode can be controlled via the `MYSQL_TLS_MODE` env var:
- `auto` (default): tries TLS, falls back to disabled
- `disabled`: explicitly skips TLS
- `preferred`: tries TLS first
- `required`: mandates TLS

### docker-compose.dev.yml Health Checks

The docker-compose.dev.yml includes health checks for all services:

```yaml
services:
  mysql:
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    aliases:
      - mysql

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    aliases:
      - redis

  backend:
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    depends_on:
      backend:
        condition: service_healthy
```

### Startup Script Health Checks

The `start-shipyard.sh` script includes comprehensive waiting logic:

```bash
# Wait for MySQL (60 second timeout)
for i in $(seq 1 60); do
  if mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u root -p"$MYSQL_ROOT_PASSWORD" --connect-expired-password -e "SELECT 1;" > /dev/null 2>&1; then
    echo "MySQL is healthy."
    break
  fi
  sleep 1
done

# Wait for Redis (30 second timeout)
for i in $(seq 1 30); do
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
    echo "Redis is healthy."
    break
  fi
  sleep 1
done
```

### Service Startup Order

The proper startup order is critical:

1. **MySQL** - starts first, has healthcheck
2. **Redis** - starts next, has healthcheck  
3. **Backend** - depends on MySQL and Redis being healthy
4. **Frontend** - depends on Backend being healthy
5. **Traefik** - routes traffic to frontend/backend

This ensures:
- No "ETIMEDOUT" errors from services trying to connect to unavailable dependencies
- No 401/500 errors from authentication failing because the database isn't ready
- No "unhandled error" logs from connection timeouts

### Common Issues & Solutions

| Issue | Solution |
|---|---|
| MySQL not ready when backend starts | Ensure `depends_on: condition: service_healthy` in docker-compose |
| Redis connection refused | Ensure Redis healthcheck passes before backend starts |
| 401/500 errors from auth | Ensure database is set up before backend starts (migrations run) |
| ETIMEDOUT errors | Check network connectivity between containers |
| Frontend can't reach backend | Ensure frontend `NEXT_PUBLIC_API_URL` matches the backend port |

### Verifying Health Checks

After starting with `docker compose -f docker-compose.dev.yml up -d`:

```powershell
# Check container health status
docker ps --filter "health=unhealthy" --filter "health=healthy"

# View health check output
docker inspect --format='{{.State.Health.Status}}' <container_name>

# View health check logs
docker logs <container_name> 2>&1 | grep -i health
```

### Production Checklist

- [ ] Dockerfile HEALTHCHECK configured
- [ ] docker-compose healthchecks defined for MySQL/Redis
- [ ] backend depends_on mysql/redis with condition: service_healthy
- [ ] frontend depends_on backend with condition: service_healthy
- [ ] MYSQL_TLS_MODE env var set appropriately for your environment
- [ ] start-shipyard.sh waiting logic matches your infrastructure
- [ ] Traefik routing rules match your domain setup
- [ ] Monitor container health with `docker ps --filter "health"`