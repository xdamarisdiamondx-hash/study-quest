# Study Quest - production-like local run
# Builds the web app, then serves it and the API from a single Node process on :4321.
# Source: docs/IMPLEMENTATION_PLAN.md (ADR-001, ADR-004)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-EnvValue([string]$name, [string]$fallback) {
    $file = Join-Path $root '.env'
    if (-not (Test-Path $file)) { return $fallback }
    $line = Get-Content $file | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if ($null -eq $line) { return $fallback }
    return ($line -replace '^[^=]+=', '').Trim()
}

# The container only needs starting when .env points at THIS machine. A hosted
# DATABASE_URL (a Neon branch, say) needs no Docker at all, and no .env means the
# built-in PGlite database - so on those setups the old unconditional
# `docker compose up` failed before the app could start. Same rule as
# scripts\install-autostart.ps1.
$databaseUrl = Read-EnvValue 'DATABASE_URL' ''
if ($databaseUrl -match 'localhost|127\.0\.0\.1|\[::1\]') {
    Write-Host "Starting the database..." -ForegroundColor Cyan
    & docker compose up -d db
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Could not start the database. Is Docker Desktop running?" -ForegroundColor Red
        exit 1
    }
} elseif ($databaseUrl -ne '') {
    Write-Host "DATABASE_URL points away from this machine; skipping Docker." -ForegroundColor DarkGray
} else {
    Write-Host "No DATABASE_URL; using the built-in local database (PGlite)." -ForegroundColor DarkGray
}

Write-Host "Building the web app..." -ForegroundColor Cyan
& pnpm --filter @sq/web build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host "`nStudy Quest is starting on http://localhost:4321" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray

& pnpm --filter @sq/server start
