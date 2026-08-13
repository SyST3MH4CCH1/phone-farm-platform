<#
.SYNOPSIS
  export-data.ps1 — Exporta los datos de la farm a un .pfbackup CIFRADO
  (envelope AES-256-GCM, clave derivada de una passphrase con scrypt).

  Incluye: cuentas (con passwords cifrados), proxies, cola, sesiones IG,
  settings y usuarios del panel. NUNCA exporta en claro (paso 10).

  Uso:
    powershell -ExecutionPolicy Bypass -File platform\scripts\export-data.ps1
    powershell ... -PassphraseEnv PF_BACKUP_PASS     # passphrase desde variable
    powershell ... -Out C:\backups\mi-backup.pfbackup

  Restaurar:  python -m phonefarm.backup restore --passphrase-env PF_BACKUP_PASS --in <fichero>
  (o platform\scripts\restore-backup.ps1)

  La passphrase NO se pide por consola (evita historial de terminal):
  define primero una variable:  $env:PF_BACKUP_PASS = "tu-frase-larga"
#>

param(
    [string]$Out = "",
    [string]$PassphraseEnv = "PF_BACKUP_PASS"
)

$ErrorActionPreference = "Stop"
$Root   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

if (-not $env:$PassphraseEnv) {
    Write-Error "Variable de entorno $PassphraseEnv vacía. Defínela primero:  `$env:$PassphraseEnv = 'tu-frase-larga'"
    exit 1
}

$args = @("-m", "phonefarm.backup", "export", "--passphrase-env", $PassphraseEnv)
if ($Out) { $args += @("--out", $Out) }

Push-Location $Root
try {
    & $Python @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
