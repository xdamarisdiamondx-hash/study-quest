<#
.SYNOPSIS
  Database backup for the Docker-Postgres setup (P21 backup automation).

.DESCRIPTION
  Two ways this app can be backed up, and this script is the second:

    1. In-app (the default): the running server writes
       data/backups/studyquest-<stamp>.zip every day and keeps 14. This is
       the only option that works on the default PGlite database — it lives
       INSIDE the app process, so nothing outside can dump it while running.

    2. This script: pg_dump straight from DATABASE_URL, for the setup where
       PostgreSQL runs in Docker (ADR-028) and you want a backup that does
       not depend on the app being open.

  Register it as a daily Windows task (run once, from a normal shell):

    powershell -ExecutionPolicy Bypass -File scripts\db-backup.ps1 -InstallTask

  The task runs daily at 01:30 and keeps the newest 14 dumps. Everything
  lands in data/backups\ — same folder as the in-app zips, same retention.
#>
param(
  [switch]$InstallTask,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [int]$Keep = 14
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "data\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

if ($InstallTask) {
  $ps = (Get-Command powershell).Source
  $action = New-ScheduledTaskAction -Execute $ps `
    -Argument "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 01:30
  Register-ScheduledTask -TaskName "Study Quest backup" `
    -Action $action -Trigger $trigger -Description `
    "pg_dump of the Study Quest database into data\backups (keeps $Keep)." | Out-Null
  Write-Host "Installed task 'Study Quest backup' — daily at 01:30."
  Write-Host "Run it now with: Start-ScheduledTask -TaskName 'Study Quest backup'"
  return
}

if (-not $DatabaseUrl) {
  Write-Host "DATABASE_URL is not set — the default PGlite database cannot be dumped"
  Write-Host "from outside the app. In-app backups cover it: Settings > Data > Back up now."
  exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $backupDir "pgdump-$stamp.dump"

# .env sits at the repo root; load it so the task finds the password too.
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
    }
  }
}

& pg_dump -Fc -f $target $DatabaseUrl
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed (exit $LASTEXITCODE)"
}

Get-ChildItem $backupDir -Filter "pgdump-*.dump" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  Remove-Item -Force

Write-Host "Backed up to $target"
