# ShipYard Production Readiness Plan
## Using Local Machine (Docker + Redis + MySQL)

**Branch**: `production-readiness`
**Goal**: Make ShipYard fully production-ready for self-hosted deployment platform
**Estimated effort**: 2-3 days

---

## Table of Contents
1. [Infrastructure Setup](#1-infrastructure-setup)
2. [Environment Configuration](#2-environment-configuration)
3. [Service Orchestration](#3-service-orchestration)
4. [Traefik & SSL](#4-traefik--ssl)
5. [Resource Tuning](#5-resource-tuning)
6. [Security Hardening](#6-security-hardening)
7. [Testing Procedure](#7-testing-procedure)
8. [Commit & Push Workflow](#8-commit--push-workflow)

---

## 1. Infrastructure Setup

### 1.1 Install Docker Desktop
- Download: https://www.docker.com/products/docker-desktop
- Install with default settings
- Verify: `docker version` and `docker compose version` both work in PowerShell
- Enable: "Start Docker Desktop when you sign in to your computer"

### 1.2 Start Required Containers
Run once (from `shipYard/` directory):

```powershell
# Start MySQL + Redis using the provided compose files
docker compose -f docker-compose.dev.yml up -d
# Or for production:
docker compose -f docker-compose.prod.yml up -d
```

### 1.3 Verify Containers Are Running
```powershell
docker compose ps
# Should show:
# - shipyard-mysql-1 (MySQL 8.4.8)
# - shipyard-redis-1 (Redis)
# - shipyard-traefik-1 (Traefik reverse proxy)
```

### 1.4 Check MySQL Initialization
```powershell
# Wait a few seconds, then:
docker exec -it shipyard-mysql-1 mysql -u root -p
# Enter root password when prompted (see .env or dev compose)
SHOW DATABASES;
# Should see: information_schema, mysql, performance_schema, shipyard
```

---

## 2. Environment Configuration

### 2.1 Copy and Configure `.env`
```powershell
# From the root shipYard directory:
Copy-Item .env.example .env
notepad .env
```

### 2.2 Critical `.env` Values to Set

| Variable | Value | Source |
|---|---|---|
| `JWT_SECRET` | Generate: `[guid]::NewGuid()` | New, never commit |
| `DB_ENV_KEY` | Generate: `[guid]::NewGuid()` | For AES-256-GCM encryption at rest |
| `FRONTEND_URL` | `http://localhost:3000` (or your port) | Used for CORS |
| `DB_HOST` | `host.docker.internal` (Windows) OR `localhost` (Mac/Linux) | Connects to host MySQL from Docker |
| `REDIS_HOST` | `host.docker.internal` (Windows) OR `localhost` (Mac/Linux) | Connects to host Redis from Docker |
| `TRaefik_PORT` | `8080` | Traefik dashboard port |

### 2.2.1 Generate Secure Values (PowerShell)
```powershell
[guid]::NewGuid()
# Copy the output and paste into .env for JWT_SECRET and DB_ENV_KEY
```

### 2.2.2 MySQL Root Password
The `docker-compose.dev.yml` should set `MYSQL_ROOT_PASSWORD`. If not, or if you want to change it:
- Edit `docker-compose.dev.yml`
- Set `MYSQL_ROOT_PASSWORD: some_strong_password`
- Update `.env` `DB_ROOT_PASSWORD` to match

---

## 3. Service Orchestration

### 3.1 Start All Services
From `shipYard/` in PowerShell:
```powershell
# Start dev environment
docker compose -f docker-compose.dev.yml up -d

# Or start all (dev + traefik):
.\start-local.ps1
```

### 3.2 Verify Services
```powershell
# Check all containers
docker compose -f docker-compose.dev.yml ps

# Check logs for errors
docker compose -f docker-compose.dev.yml logs -f

# Test MySQL connection
docker exec -it shipyard-mysql-1 mysql -u root -p$env:DB_ROOT_PASSWORD

# Test Redis connection
docker exec -it shipyard-redis-1 redis-cli ping
```

### 3.3 Initial Backend Start
```powershell
# From backend directory
cd backend
npm install   # if first time
npm run migrate # run database migrations
npm run seed    # if seed script exists
```

### 3.4 Start Frontend
```powershell
cd frontend
npm install   # if first time
npm run dev    # starts on http://localhost:3000
```

### 3.5 Test Basic Functionality
- Open `http://localhost:3000` in browser
- Register a new account
- Create a project
- Try a deployment
- Test shell access

---

## 4. Traefik & SSL

### 4.1 Traefik Configuration
The `docker-compose.dev.yml` and `docker-compose.prod.yml` should already include Traefik. Key settings:

```yaml
# From compose file - should already be present:
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.shipyard.entrypoint=web"
  - "traefik.http.routers.shipyard.rule=Host(`shipyard.localhost`)"
  - "traefik.http.services.shipyard.loadbalancer.server.port=3000"
```

### 4.2 Windows Hosts File
For `shipyard.localhost` to resolve to 127.0.0.1:

```powershell
# Run as Administrator:
notepad C:\Windows\System32\drivers\etc\hosts
# Add line:
127.0.0.1 shipyard.localhost
# Save and close
```

### 4.3 Traefik Dashboard
- Visit: `http://localhost:8080/dashboard/`
- Login with Traefik static file credentials (check compose for `traefik.log`)
- See routing status, request counts, etc.

### 4.4 SSL/HTTPS (Production)
For production with real domains:
1. Place TLS certificates in `certs/` directory (gitignored)
2. Configure Traefik `certificatesResolvers` for Let's Encrypt or manual CA
3. Update `TRaefik_DOMAIN` in `.env` to your real domain
4. HTTP→HTTPS redirect enabled

### 4.5 Local HTTPS (Development)
If you need HTTPS locally without a real domain:
1. Generate self-signed certs:
   ```powershell
   openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -outout certs/cert.pem -days 365 -nodes -subj "/CN=shipyard.localhost"
   ```
2. Configure Traefik to use these certs
3. Update `NEXT_PUBLIC_API_URL` in `.env` to `https://shipyard.localhost:443`

---

## 5. Resource Tuning

### 5.1 Docker Resource Limits
Edit `docker-compose.dev.yml` or `docker-compose.prod.yml`:

```yaml
services:
  mysql:
    mem_limit: 1g          # 1GB max memory
    cpus: '0.5'            # 500m CPU limit
    
  redis:
    mem_limit: 512m        # 512MB max memory
    
  shipyard-backend:
    mem_limit: 2g
    cpus: '1.0'
```

### 5.2 MySQL Tuning
After MySQL is running:
```powershell
docker exec -it shipyard-mysql-1 mysql -u root -p$env:DB_ROOT_PASSWORD

# Check current settings:
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';

# Set reasonable limits:
SET GLOBAL max_connections = 100;
SET GLOBAL innodb_buffer_pool_size = 100*1024*1024;  # 100MB
```

### 5.2 Redis Tuning
```powershell
docker exec -it shipyard-redis-1 redis-cli CONFIG SET maxmemory 256mb
docker exec -it shipyard-redis-1 redis-cli CONFIG GET maxmemory
```

### 5.2 Node.js Memory
In `backend/.env` or `backend/config/index.js`:
```env
NODE_OPTIONS=--max-old-space-size=1024  # 1GB max Node.js heap
```

---

## 6. Security Hardening

### 6.1 Environment Secrecy
- [ ] `JWT_SECRET` - generate new, never share, never commit
- [ ] `DB_ENV_KEY` - generate new, never share, never commit
- [ ] `MYSQL_ROOT_PASSWORD` - strong, in `.env` only
- [ ] `FRONTEND_URL` - exact match with your deployment
- [ ] Any API keys or tokens - not in repo

### 6.2 .gitignore Verification
Ensure these are gitignored (already checked in earlier):
- `.env`
- `.env.example` (may contain placeholder values only)
- `certs/` directory
- `logs/` directory
- `worker/.env` if exists
- `backend/.env` if exists

### 6.3 MySQL Security
```powershell
# Change root password if default:
docker exec -it shipyard-mysql-1 mysql -u root -p
ALTER USER 'root'@'host' IDENTIFIED BY 'new_strong_password';
FLUSH PRIVILEGES;

# Create a dedicated user for the app:
CREATE USER 'shipyard'@'%' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON shipyard.* TO 'shipyard'@'%';
FLUSH PRIVILEGES;
```

### 6.4 firewall (Windows Defender)
Allow ports needed:
```powershell
# Allow Docker/Traefik ports
netsh advfirewall add rule name="Docker HTTP" dir=in action=allow protocol=tcp localport=80
netsh advfirewall add rule name="Docker HTTPS" dir=in action=allow protocol=tcp localport=443
netsh advfirewall add rule name="Traefik Dashboard" dir=in action=allow protocol=tcp localport=8080
netsh advfirewall add rule name="Node.js App" dir=in action=allow protocol=tcp localport=3000
```

---

## 7. Testing Procedure

### 7.1 Backend Tests
```powershell
cd backend
npm test
# Expected: 97/97 tests passing across 21 suites
```

### 7.2 Frontend Tests
```powershell
cd frontend
npm run lint
npm run build
# Expected: lint clean, build green
```

### 7.2 End-to-End Flow Test
1. Register → Verify email/audit
2. Create project → Verify project appears on `/projects`
3. Set build config (repo URL, branch, build/run commands)
4. Deploy → Watch `QUEUED→SUCCESS` in deployments page
5. Check live URL via `live ↗` link
6. Test rollback via redeploy button
7. Test shell sessions (WS gateway)
8. Test custom domain setup
9. Test env var import/export
10. Test project delete (tears down containers)

### 7.3 Stress/Test Scenarios
- Create multiple projects (5-10) simultaneously
- Deploy to multiple projects in parallel
- Test session expiry (wait 15+ minutes, session should expire)
- Test rate limiting (make rapid API calls, should get 429)
- Test webhook deduplication (send same payload twice)
- Test rollback (deploy, verify, redeploy previous version)

### 7.4 Docker Resource Monitoring
```powershell
# Monitor container resources
docker stats

# Monitor over time (stream)
docker stats --no-stream

# Check MySQL performance
docker exec -it shipyard-mysql-1 mysql -u root -p -e "SHOW PROCESSLIST;"

# Check Redis keys
docker exec -it shipyard-redis-1 redis-cli DBSIZE
docker exec -it shipyard-redis-1 keys '*'
```

---

## 8. Commit & Push Workflow

### 8.1 After Each Working Session
```powershell
# Stage all changed files (not node_modules, logs, etc. - they're gitignored)
git add -A

# Commit with descriptive message
git commit -m "feat: add production readiness improvement - <short description>"

# Push to remote (if you have a remote repo)
git push origin production-readiness
```

### 8.2 Before Marking Complete
```powershell
# Run full test suites one more time
cd backend && npm test
cd frontend && npm run lint && npm run build

# Verify all services still running
docker compose -f docker-compose.dev.yml ps

# Test one full user flow manually
# - Register
# - Create project
# - Deploy
# - Check live link
# - Test redeploy
# - Test shell
```

### 8.3 Final Checklist Before Merging
- [ ] All 97 backend tests passing
- [ ] Frontend lint clean + build green
- [ ] Docker containers all running
- [ ] `.env` has secure values (no defaults)
- [ ] Traefik routing working (`shipyard.localhost` accessible)
- [ ] No secrets in git history (if any, `git filter-branch --tree-filter` to remove)
- [ ] `.gitignore` covers all sensitive files
- [ ] Documentation updated (this file + any README changes)

---

## 📦 Quick Start Summary (Run These Commands)

```powershell
# 1. Clone / ensure you're in shipYard directory
cd D:\Documents\Projects\shipYard

# 2. Create and switch to production-readiness branch
git checkout -b production-readiness

# 3. Start infrastructure
docker compose -f docker-compose.dev.yml up -d

# 4. Configure environment
Copy-Item .env.example .env
notepad .env   # Fill in JWT_SECRET, DB_ENV_KEY, etc.

# 5. Add hosts entry (Windows)
echo 127.0.0.1 shipyard.localhost | Out-File -Append C:\Windows\System32\drivers\etc\hosts

# 6. Start backend
cd backend
npm install
npm run migrate
# (or: .\start-local.ps1 if script exists)

# 7. Start frontend
cd ../frontend
npm install
npm run dev

# 8. Open browser and test
# Visit: http://localhost:3000
# Or: http://shipyard.localport:3000 (if Traefik rewrites host)

# 9. Run test suites
cd ../backend
npm test   # 97/97 should pass

# 10. When ready to commit
git add -A
git commit -m "chore: production readiness setup for local Docker development"
git push origin production-readiness
```

---

## ⚠️ Known Issues & Workarounds

| Issue | Workaround |
|---|---|
| MySQL DNS NXDOMAIN on startup | Use `host.docker.internal` in `.env` DB_HOST (Windows) |
| Redis connection refused | Ensure `docker compose up` completed; check `redis-cli ping` |
| Traefik not routing | Check `shipyard.localhost` in hosts file; verify Traefik container logs |
| Session expires instantly | Verify `DB_ENV_KEY` is set and consistent; check MySQL AES plugin |
| Build fails with phantom IMAGE_CREATED | Already fixed with `buildErrorOf` in code; ensure docker-compose using latest image |
| Rate limiting 429s | Ensure Redis is running; check `redis-cli CONFIG GET maxmemory` |
| Traefik dashboard 404 | Ensure Traefik container is up; check `docker logs shipyard-traefik-1` |

---

## 📞 Getting Help

If stuck:
1. Check `logs/backend.err.log` and `logs/frontend.err.log`
2. Run `docker compose logs -f [service-name]`
3. Verify `.env` values match docker compose definitions
4. Ensure no port conflicts (3000, 80, 8080, 4000 all free)
5. Review `PRODUCTION_READINESS_PLAN.md` for each step
6. Open issues against the repo if bugs found

---

**This plan will make ShipYard production-ready using only your local machine's Docker, with MySQL and Redis running as Docker containers. All sensitive config is via `.env` (never committed). The goal is zero external SaaS dependencies beyond the Docker images themselves.**