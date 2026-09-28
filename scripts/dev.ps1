# Study Quest — development mode
# Starts the database container, then the API and the web dev server together.
# The database is a container (ADR-028); the app runs natively for fast HMR (ADR-029).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# The database first, so the API never boots against a missing database.
Write-Host "Starting the database..." -ForegroundColor Cyan
& docker compose up -d db
if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not start the database. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

$health = (& docker inspect --format '{{.State.Health.Status}}' studyquest-db 2>$null)
if ($health -ne 'healthy') {
    Write-Host "Waiting for the database to become healthy (currently: $health)..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $health = (& docker inspect --format '{{.State.Health.Status}}' studyquest-db 2>$null)
        if ($health -eq 'healthy') { break }
    }
}
if ($health -eq 'healthy') {
    Write-Host "Database ready." -ForegroundColor Green
} else {
    Write-Host "Database is not healthy. Continuing anyway; check 'pnpm db:logs'." -ForegroundColor Yellow
}

Write-Host "`nStarting the app. Web on http://localhost:5173, API on http://localhost:4321" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray

# `pnpm -r --parallel dev` runs the dev script in every workspace package that has one.
& pnpm -r --parallel dev
