# Study Quest - start at Windows logon (P22)
#
# Registers a scheduled task that brings the app up when you sign in to Windows, so
# daily use never needs a terminal. The task runs THIS file with -Run, which is also
# the mode you can execute by hand to test it end to end.
#
#   scripts\install-autostart.ps1             register (re-running replaces the task)
#   scripts\install-autostart.ps1 -Status     what is registered, and when it last ran
#   scripts\install-autostart.ps1 -Uninstall  remove it again
#   scripts\install-autostart.ps1 -Run        the task body: wait for the database,
#                                             build if needed, serve on :4321
#
# Source: docs/IMPLEMENTATION_PLAN.md (P22)

[CmdletBinding()]
param(
    [switch]$Status,
    [switch]$Uninstall,
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'Study Quest'
$appUrl = 'http://localhost:4321'

function Read-EnvValue([string]$name, [string]$fallback) {
    $file = Join-Path $root '.env'
    if (-not (Test-Path $file)) { return $fallback }
    $line = Get-Content $file | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if ($null -eq $line) { return $fallback }
    return ($line -replace '^[^=]+=', '').Trim()
}

# The task runs outside any shell profile, so resolve pnpm the way the npm
# installer lays it out if the PATH of the logon session does not have it.
function Resolve-Pnpm {
    $cmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { return $cmd.Source }
    $installed = Join-Path $env:APPDATA 'npm\pnpm.cmd'
    if (Test-Path $installed) { return $installed }
    return $null
}

if ($Run) {
    Set-Location $root

    $logDir = Join-Path $root 'data'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    $log = Join-Path $logDir 'autostart.log'
    # Keep the log to the last few logons rather than growing forever.
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 512KB) { Remove-Item $log -Force }

    Start-Transcript -Path $log -Append | Out-Null
    try {
        Write-Host "[autostart] $(Get-Date -Format s) starting from $root"

        $pnpm = Resolve-Pnpm
        if ($null -eq $pnpm) {
            Write-Host "[autostart] pnpm was not found, so Study Quest cannot start. Reinstall pnpm with the standalone installer (it adds itself to the PATH), then re-run this script by hand." -ForegroundColor Red
            exit 1
        }

        $databaseUrl = Read-EnvValue 'DATABASE_URL' ''
        if ($databaseUrl -match 'localhost|127\.0\.0\.1|\[::1\]') {
            # The database in .env is this machine's. createDb falls back to a second,
            # empty PGlite database when Postgres is not accepting connections - silent
            # data in the wrong place - so wait for Docker instead of racing it.
            $dbUser = Read-EnvValue 'POSTGRES_USER' 'studyquest'
            $dbName = Read-EnvValue 'POSTGRES_DB' 'studyquest'
            $docker = Get-Command docker -ErrorAction SilentlyContinue
            if ($null -eq $docker) {
                Write-Host "[autostart] .env points at a local database but Docker is not installed, so Study Quest was not started. Install Docker Desktop, or point DATABASE_URL elsewhere." -ForegroundColor Red
                exit 1
            }

            $ready = $false
            $launched = $false
            # Docker Desktop usually starts with Windows; at a cold logon it can take
            # a minute to accept connections, hence the patient loop.
            for ($i = 1; $i -le 24; $i++) {
                & docker compose up -d db *> $null
                if ($LASTEXITCODE -eq 0) {
                    & docker compose exec -T db pg_isready -U $dbUser -d $dbName *> $null
                    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
                } elseif (-not $launched) {
                    $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
                    if (Test-Path $exe) {
                        Start-Process $exe | Out-Null
                        $launched = $true
                        Write-Host "[autostart] Docker Desktop was not running; asked it to start"
                    }
                }
                Start-Sleep -Seconds 5
            }

            if (-not $ready) {
                Write-Host "[autostart] the local database never became ready, so Study Quest was NOT started: the app would have fallen back to a second, empty database. Start Docker Desktop, check 'docker compose ps', and run scripts\install-autostart.ps1 -Run." -ForegroundColor Red
                exit 1
            }
            Write-Host "[autostart] database is ready"
        } elseif ($databaseUrl -ne '') {
            Write-Host "[autostart] DATABASE_URL points away from this machine, skipping Docker"
        } else {
            Write-Host "[autostart] no DATABASE_URL in .env: the app uses its built-in local database"
        }

        # First run only: without a build there is nothing to serve, so make one.
        if (-not (Test-Path (Join-Path $root 'apps\web\dist\index.html'))) {
            Write-Host "[autostart] building the web app (first run)..."
            & $pnpm --filter '@sq/web' build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[autostart] the build failed; see the output above." -ForegroundColor Red
                exit 1
            }
        }

        Write-Host "[autostart] serving $appUrl - log: data\autostart.log" -ForegroundColor Green
        & $pnpm --filter '@sq/server' start
    } finally {
        Stop-Transcript | Out-Null
    }
    exit 0
}

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "No '$taskName' task is registered." -ForegroundColor DarkGray
        exit 0
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed. Study Quest will no longer start at logon." -ForegroundColor Green
    exit 0
}

if ($Status) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Not registered. Run scripts\install-autostart.ps1 to register it." -ForegroundColor Yellow
        exit 0
    }
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    Write-Host "Task    : $($existing.TaskName) [$($existing.State)]" -ForegroundColor Cyan
    Write-Host "Trigger : at logon of $env:USERDOMAIN\$env:USERNAME"
    Write-Host "App     : $appUrl"
    Write-Host "Last run: $($info.LastRunTime)  result: $($info.LastTaskResult)  (0 = success)"
    Write-Host "Log     : data\autostart.log"
    exit 0
}

$self = $PSCommandPath
if ($null -eq $self) { $self = $MyInvocation.MyCommand.Path }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$self`" -Run" `
    -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force `
    -Description "Starts Study Quest ($appUrl) when $env:USERNAME signs in to Windows." | Out-Null

Write-Host "Registered. Study Quest now starts when you sign in to Windows." -ForegroundColor Green
Write-Host "  App      : $appUrl"
Write-Host "  Log      : data\autostart.log"
Write-Host "  Test now : Start-ScheduledTask -TaskName '$taskName'"
Write-Host "  Status   : scripts\install-autostart.ps1 -Status"
Write-Host "  Remove   : scripts\install-autostart.ps1 -Uninstall"
