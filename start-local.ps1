# ShipYard local runner - redis + traefik + backend + worker + frontend.
# Run from this repo root in your own PowerShell:  .\start-local.ps1
# Opens three windows (backend :4000, worker, frontend :3000). Close the windows to stop.
# Redis + Traefik run as Docker containers; Docker Desktop must be running.
# Traefik routes http://<app>.shipyard.localhost (resolves to 127.0.0.1 on Windows).
#
# PICK ONE RUNTIME: either this script OR the compose stack
# (`docker compose -f docker-compose.dev.yml up -d`), never both — they bind
# the same ports (:3000/:4000/:6379/:80) and will fight each other.
# If compose is up, stop it first: docker compose -f docker-compose.dev.yml down

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-ContainerExists([string]$Name) {
  docker inspect $Name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

# --- Mutual-exclusion guard: refuse to start on top of the compose stack ---
$composeUp = docker ps --format "{{.Names}}" 2>$null | Where-Object { $_ -match "^shipyard-(backend|frontend|worker|redis|traefik)-1$" }
if ($composeUp) {
  Write-Error ("Compose stack is already running (" + ($composeUp -join ", ") + "). " +
    "Stop it first with `docker compose -f docker-compose.dev.yml down`, then re-run this script. " +
    "Alternatively keep compose and skip this script entirely.")
}

$busy4000 = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
$busy3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($busy4000 -or $busy3000) {
  Write-Error "Port 4000 and/or 3000 is already in use - something else is serving them. Stop it first, then re-run."
}

# --- Dependency guards ---
foreach ($dir in @("backend", "frontend", "worker")) {
  if (-not (Test-Path "$root\$dir\node_modules")) {
    Write-Output "Installing dependencies in $dir (one time)..."
    Push-Location "$root\$dir"
    npm install --no-audit --no-fund
    Pop-Location
  }
}

Write-Output "Ensuring redis (standalone shipyard-redis container)..."
if (Test-ContainerExists "shipyard-redis") {
  docker start shipyard-redis | Out-Null
} else {
  docker run -d --name shipyard-redis --restart unless-stopped -p 6379:6379 -v shipyard-redis-data:/data redis:7-alpine | Out-Null
}

Write-Output "Ensuring traefik (standalone shipyard-traefik container, :80)..."
if (Test-ContainerExists "shipyard-traefik") {
  docker start shipyard-traefik | Out-Null
} else {
  docker run -d --name shipyard-traefik --restart unless-stopped -p 80:80 -v /var/run/docker.sock:/var/run/docker.sock traefik:v3 --api.insecure=true --providers.docker=true --entrypoints.web.address=:80 | Out-Null
}

if (-not (Test-Path "$root\frontend\.next")) {
  Write-Output "Frontend production build missing - building now (one time, about a minute)..."
  Push-Location "$root\frontend"
  npm run build
  Pop-Location
}

Write-Output "Starting backend  on http://localhost:4000"
$backendCmd = "Set-Location '" + $root + "\backend'; node src/server.js"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $backendCmd

Write-Output "Starting worker (deployment pipeline)"
$workerCmd = "Set-Location '" + $root + "\worker'; node src/index.js"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $workerCmd

Write-Output "Starting frontend on http://localhost:3000"
$frontendCmd = "Set-Location '" + $root + "\frontend'; node node_modules/next/dist/bin/next start -p 3000"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $frontendCmd

Write-Output "Done. Open http://localhost:3000 in your browser."
