<#
.SYNOPSIS
  restore-backup.ps1 — Restaura un .pfbackup cifrado en la BD local.

  Uso:
    $env:PF_BACKUP_PASS = "tu-frase-larga"
    powershell -ExecutionPolicy Bypass -File platform\scripts\restore-backup.ps1 -In C:\backups\phonefarm-2026-08-13.pfbackup
#>
param(
    [Parameter(Mandatory = $true)][string]$In,
    [string]$PassphraseEnv = "PF_BACKUP_PASS"
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

if (-not $env:$PassphraseEnv) {
    Write-Error "Variable de entorno $PassphraseEnv vacía."
    exit 1
}
if (-not (Test-Path $In)) { Write-Error "No existe $In"; exit 1 }

Push-Location $Root
try {
    & $Python -m phonefarm.backup restore --passphrase-env $PassphraseEnv --in $In
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
