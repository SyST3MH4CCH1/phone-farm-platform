<#
.SYNOPSIS
Crea el primer usuario admin del panel (passwords con scrypt en SQLite).

.DESCRIPTION
Envuelve `python -m phonefarm.admin create`. El password se pide
interactivamente (no se muestra) o se lee de una variable de entorno.

.EXAMPLE
./platform/scripts/create-admin.ps1                     # admin interactivo
./platform/scripts/create-admin.ps1 -Username admin -PasswordEnv ADMIN_PASSWORD
#>
param(
    [string]$Username = "admin",
    [string]$PasswordEnv = ""
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Python = Join-Path $Root "platform\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

Push-Location (Join-Path $Root "platform")
try {
    $args = @("-m", "phonefarm.admin", "create", "--username", $Username)
    if ($PasswordEnv) { $args += @("--password-env", $PasswordEnv) }
    & $Python @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
