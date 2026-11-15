# Start the VeriSec KYC stack on this PC, secured end to end.
#   powershell -ExecutionPolicy Bypass -File backend\infra\start-secure-dev.ps1
#
#   https://localhost:3000   frontend  (TLS 1.3, certificate from the name-constrained dev CA)
#   https://localhost:3001   Console API (TLS 1.3; DPoP sessions; mTLS client to the global API)
#   127.0.0.1:8200           local OpenBao (encrypts reports at rest); unsealed here if needed
$ErrorActionPreference = "Stop"
$root  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)          # verisec_web_ui_back
$pki   = Join-Path $PSScriptRoot "pki"
$infra = $PSScriptRoot

# 1. OpenBao (container) up and unsealed
# OpenBao (keys), MinIO (encrypted files) and the TLS-only KYC records database
docker compose -f (Join-Path $infra "docker-compose.yml") up -d openbao minio kycdb | Out-Null
Start-Sleep -Seconds 2
& (Join-Path $infra "openbao\unseal.ps1")

# 2. free the ports
foreach ($p in 3000, 3001) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}

# 3. Console API over HTTPS
$console = Join-Path $root "backend\services\console"
$env:TLS_CERT = Join-Path $pki "localhost.crt"
$env:TLS_KEY  = Join-Path $pki "localhost.key"
# Node 24 (OpenSSL 3.5) so the Console -> global API hop uses post-quantum key exchange.
# Installed side by side with nvm; the machine's default Node is left alone.
$node24 = Get-ChildItem (Join-Path $env:LOCALAPPDATA "nvm") -Directory -Filter "v24.*" |
  Sort-Object Name -Descending | Select-Object -First 1
$consoleNode = if ($node24) { Join-Path $node24.FullName "node.exe" } else { "node" }
Start-Process -FilePath $consoleNode -ArgumentList "dist/main" -WorkingDirectory $console -WindowStyle Minimized

# 4. Frontend over HTTPS (built with NEXT_PUBLIC_AUTH_API=https://localhost:3001)
$front = Join-Path $root "frontend"
Start-Process -FilePath "node" -WorkingDirectory $front -WindowStyle Minimized -ArgumentList @(
  "node_modules/serve/build/main.js", "out", "-l", "3000",
  "--ssl-cert", (Join-Path $pki "localhost.crt"), "--ssl-key", (Join-Path $pki "localhost.key"))

Start-Sleep -Seconds 6
Write-Output "Frontend:    https://localhost:3000/verify/address-upload/"
Write-Output "Console API: https://localhost:3001"
Write-Output "Security tests: cd backend\services\console; node test/security/run-all.mjs"
