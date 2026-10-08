# LAN HTTPS for phone installs (P20, ADR-023).
#
# A phone only gets a service worker — and therefore the offline app and the
# install prompt — over a TRUSTED https origin, and a LAN address is not
# localhost, so the phone has to trust a certificate authority. mkcert is the
# zero-cost local answer: this script installs its CA on this machine, writes a
# certificate for localhost + 127.0.0.1 + this machine's LAN IP into .certs
# (read by vite preview), and prints the two steps the phone needs.
#
#   .\scripts\lan-setup.ps1          # (re)create the certificate
#
# Prerequisite, once:  winget install FiloSottile.mkcert
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Host "mkcert is not installed. Install it first:" -ForegroundColor Yellow
  Write-Host "  winget install FiloSottile.mkcert"
  exit 1
}

# Trust this computer's own CA (phones get it separately — see below).
mkcert -install

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
  Write-Host "No LAN IPv4 address found — connect to a network and rerun." -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Force -Path .certs | Out-Null
mkcert -cert-file .certs\dev-cert.pem -key-file .certs\dev-key.pem localhost 127.0.0.1 $ip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$caroot = (mkcert -CAROOT).Trim()
Write-Host ""
Write-Host "Certificate written to .certs for localhost, 127.0.0.1 and $ip." -ForegroundColor Green
Write-Host ""
Write-Host "Phone steps:" -ForegroundColor Cyan
Write-Host " 1. Copy this file to your phone (any route you like):"
Write-Host "      $caroot\rootCA.pem"
Write-Host " 2. Install it there:"
Write-Host "    Android: Settings > Security & privacy > More > Encryption & credentials"
Write-Host "             > Install a certificate > CA certificate"
Write-Host "    iPhone:  Settings > Profile Downloaded > Install (enter the passcode)"
Write-Host " 3. On this machine, in two shells:"
Write-Host "      pnpm --filter @sq/server dev    # the API"
Write-Host "      pnpm lan                        # build + serve the app"
Write-Host " 4. On the phone open https://$ip`:4173, enter the app PIN"
Write-Host "    (turn LAN on first: Settings > LAN access), then browser menu"
Write-Host "    > Add to Home Screen."
