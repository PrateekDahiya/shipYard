# ShipYard local runner - redis + traefik + backend + worker + frontend.
# Run from this repo root in your own PowerShell:  .\start-local.ps1
# Opens three windows (backend :4000, worker, frontend :3000). Close the windows to stop.
# Redis + Traefik run as Docker containers; Docker Desktop must be running.
# Traefik routes http://<app>.shipyard.localhost (resolves to 127.0.0.1 on Windows).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$busy4000 = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
$busy3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($busy4000) { Write-Warning "Port 4000 is already in use - backend may already be running." }
if ($busy3000) { Write-Warning "Port 3000 is already in use - frontend may already be running." }

Write-Output "Ensuring redis (shipyard-redis container)..."
$existing = docker ps -a --filter "name=shipyard-redis" --format "{{.Names}}"
if (-not $existing) {
  docker run -d --name shipyard-redis --restart unless-stopped -p 6379:6379 -v shipyard-redis-data:/data redis:7-alpine | Out-Null
} else {
  docker start shipyard-redis | Out-Null
}

Write-Output "Ensuring traefik (shipyard-traefik container, :80)..."
$traefik = docker ps -a --filter "name=shipyard-traefik" --format "{{.Names}}"
if (-not $traefik) {
  docker run -d --name shipyard-traefik --restart unless-stopped -p 80:80 -v /var/run/docker.sock:/var/run/docker.sock traefik:v3 --api.insecure=true --providers.docker=true --entrypoints.web.address=:80 | Out-Null
} else {
  docker start shipyard-traefik | Out-Null
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
$workerCmd = "Set-Location '" + $root + "\worker'; if (-not (Test-Path 'node_modules')) { npm install --no-audit --no-fund }; node src/index.js"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $workerCmd

Write-Output "Starting frontend on http://localhost:3000"
$frontendCmd = "Set-Location '" + $root + "\frontend'; node node_modules/next/dist/bin/next start -p 3000"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $frontendCmd

Write-Output "Done. Open http://localhost:3000 in your browser."
