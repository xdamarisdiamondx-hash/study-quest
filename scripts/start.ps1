# Study Quest — production-like local run
# Builds the web app, then serves it and the API from a single Node process on :4321.
# Source: docs/IMPLEMENTATION_PLAN.md (ADR-001, ADR-004)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting the database..." -ForegroundColor Cyan
& docker compose up -d db
if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not start the database. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host "Building the web app..." -ForegroundColor Cyan
& pnpm --filter @sq/web build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host "`nStudy Quest is starting on http://localhost:4321" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray

& pnpm --filter @sq/server start
