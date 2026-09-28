# Study Quest — environment and local tooling
# Source of truth: docs/IMPLEMENTATION_PLAN.md (ADR-024, ADR-028)
#
# Requires: Node 22 LTS, pnpm, Docker Desktop (WSL 2 backend).
# Run .\scripts\setup.ps1 once, then .\scripts\dev.ps1.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  FAIL $msg" -ForegroundColor Red }

# ---------------------------------------------------------------- prerequisites
Write-Step "Checking prerequisites"

$failed = $false

# Node 22+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Err "Node.js is not installed."
    Write-Host "       Install it with:  winget install OpenJS.NodeJS.LTS"
    Write-Host "       Then close and reopen this terminal."
    $failed = $true
} else {
    $raw = (& node --version) -replace '^v',''
    $major = [int]($raw.Split('.')[0])
    if ($major -lt 22) {
        Write-Err "Node $raw found, but 22 or newer is required."
        Write-Host "       Install it with:  winget install OpenJS.NodeJS.LTS"
        $failed = $true
    } else { Write-Ok "Node $raw" }
}

# pnpm (installed through corepack, which ships with Node)
if ($failed) {
    Write-Host "`nSetup cannot continue. Install the missing tools, reopen this terminal, and run it again." -ForegroundColor Red
    exit 1
}

$corepack = Get-Command corepack -ErrorAction SilentlyContinue
if (-not $corepack) {
    Write-Warn "corepack not found; falling back to npm install -g pnpm"
    & npm install -g pnpm | Out-Null
} else {
    & corepack enable pnpm 2>$null
}
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) { Write-Ok "pnpm $(& pnpm --version)" } else { Write-Err "pnpm is not available."; exit 1 }

# Docker
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Err "Docker is not installed."
    Write-Host "       Install it with:  winget install Docker.DockerDesktop"
    Write-Host "       Then sign out and back in so the WSL 2 backend is available."
    exit 1
}
Write-Ok "Docker $(& docker --version)"

# Docker actually running? (installed but not started is the common case)
$dockerUp = $false
try { $null = & docker info 2>&1; $dockerUp = ($LASTEXITCODE -eq 0) } catch { $dockerUp = $false }
if (-not $dockerUp) {
    Write-Warn "Docker is installed but not running. Starting it now..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    Write-Host "       Docker Desktop is starting. It can take a minute on first run."
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5
        try { $null = & docker info 2>&1; if ($LASTEXITCODE -eq 0) { $dockerUp = $true; break } } catch {}
    }
}
if ($dockerUp) { Write-Ok "Docker engine is running" } else { Write-Warn "Docker engine not responding yet. Continue and run 'pnpm db:up' once it is up." }

# ---------------------------------------------------------------------- env file
Write-Step "Preparing .env"

if (Test-Path ".env") {
    Write-Ok ".env already exists (left untouched)"
} else {
    Copy-Item ".env.example" ".env"
    # Generate a random password for the local database.
    $bytes = New-Object byte[] 18
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = [Convert]::ToBase64String($bytes).Replace('+','').Replace('/','').Replace('=','')
    $pw = $pw.Substring(0, 20)
    (Get-Content ".env" -Raw).Replace('change-me', $pw) | Set-Content ".env" -Encoding UTF8
    Write-Ok ".env created with a generated database password"
}

# ----------------------------------------------------------------- dependencies
Write-Step "Installing dependencies"
& pnpm install
if ($LASTEXITCODE -ne 0) { Write-Err "pnpm install failed."; exit 1 }
Write-Ok "dependencies installed"

# --------------------------------------------------------------------- database
Write-Step "Starting the database (PostgreSQL 17 in Docker)"
if ($dockerUp) {
    & docker compose up -d db
    Write-Host "       Waiting for the database to become healthy..."
    & docker compose exec -T db pg_isready -U studyquest -d studyquest 2>$null | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
        & docker compose ps --format json 2>$null | Out-String | Out-Null
        $health = (& docker inspect --format '{{.State.Health.Status}}' studyquest-db 2>$null)
        if ($health -eq 'healthy') { break }
        Start-Sleep -Seconds 2
    }
    $health = (& docker inspect --format '{{.State.Health.Status}}' studyquest-db 2>$null)
    if ($health -eq 'healthy') { Write-Ok "database is healthy on 127.0.0.1:5432" }
    else { Write-Warn "database not healthy yet ($health). Check with: pnpm db:logs" }
} else {
    Write-Warn "Docker is not running; skipping database start."
    Write-Host "       Once Docker is up, run:  pnpm db:up"
}

# ----------------------------------------------------------------------- assets
Write-Step "Generating app icons from brand/logo-mark.svg"
if (Test-Path "scripts/generate-icons.mjs") {
    & node scripts/generate-icons.mjs
    if ($LASTEXITCODE -eq 0) { Write-Ok "icons written to apps/web/public/icons" }
    else { Write-Warn "icon generation failed; run it again later" }
} else {
    Write-Warn "scripts/generate-icons.mjs not present yet (comes with the app skeleton in P0)"
}

# ------------------------------------------------------------------------- done
Write-Step "Setup complete"
Write-Host "  Start developing:   .\scripts\dev.ps1" -ForegroundColor Green
Write-Host "  Start the app:      .\scripts\start.ps1"
Write-Host "  Database logs:      pnpm db:logs"
Write-Host "  Back up data:       .\scripts\db-backup.ps1`n"
