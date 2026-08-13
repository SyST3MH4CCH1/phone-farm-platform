<#
.SYNOPSIS
Aplica ACL restrictiva (usuario actual + SYSTEM) a los datos de Phone Farm
(platform/data, backups, .env, clave maestra, sesiones, vídeos).

.DESCRIPTION
icacls /inheritance:r /grant:r "<usuario>:(F)" "SYSTEM:(F)" sobre:
  - platform\data         (BD SQLite + clave maestra + backups)
  - platform\backups      (si existe)
  - .env y platform\.env  (secretos)
  - platform\sessions, platform\videos, platform\logs

.EXAMPLE
./platform/scripts/lock-data-acl.ps1
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$who = "$env:USERDOMAIN\$env:USERNAME"

$targets = @(
    (Join-Path $Root "platform\data"),
    (Join-Path $Root "platform\backups"),
    (Join-Path $Root ".env"),
    (Join-Path $Root "platform\.env"),
    (Join-Path $Root "platform\sessions"),
    (Join-Path $Root "platform\videos"),
    (Join-Path $Root "platform\logs")
)
$done = 0
foreach ($t in $targets) {
    if (-not (Test-Path $t)) { continue }
    & icacls $t /inheritance:r /grant:r "${who}:(F)" "SYSTEM:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls falló sobre $t" }
    Write-Host "  ✓ ACL aplicada: $t" -ForegroundColor DarkGreen
    $done++
}
Write-Host "ACLs aplicadas a $done rutas (usuario: $who + SYSTEM)" -ForegroundColor Green
