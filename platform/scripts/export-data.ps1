<#
.SYNOPSIS
  export-data.ps1 — Exporta TODOS los datos de la farm a un ZIP con timestamp
  para migrar a otra máquina (o hacer backup).

  Incluye: accounts.json, proxies.json, queue.json, content_profiles.json,
  sessions/ (cookies IG), logs/workflows/, logs/fallback_queue.json y videos/.

  Uso:  powershell -ExecutionPolicy Bypass -File platform\scripts\export-data.ps1
        powershell ... -Out C:\backups   (destino distinto; default: ..\backups)

  Importar en la máquina nueva: descomprimir el ZIP sobre platform/ y
  `adb reconnect` los dispositivos (los seriales se re-enumeran solos).
#>

param([string]$Out = "")

$ErrorActionPreference = "Stop"
$Root   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Dest   = if ($Out) { $Out } else { Join-Path (Split-Path $Root) "backups" }
$Stamp  = Get-Date -Format "yyyyMMdd-HHmm"
$ZipDir = Join-Path $Dest "phonefarm-export-$Stamp"
$Zip    = "$ZipDir.zip"

if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
if (Test-Path $ZipDir) { Remove-Item $ZipDir -Recurse -Force }
New-Item -ItemType Directory -Path $ZipDir -Force | Out-Null

Write-Host "=== Exportando Phone Farm a $Zip ..." -ForegroundColor Cyan
$items = @(
    (Join-Path $Root "accounts.json"),
    (Join-Path $Root "proxies.json"),
    (Join-Path $Root "queue.json"),
    (Join-Path $Root "content_profiles.json")
)
# Carpetas (solo si existen)
foreach ($d in @("sessions", "logs", "videos")) {
    $p = Join-Path $Root $d
    if (Test-Path $p) { $items += $p }
}
foreach ($i in $items) {
    if (Test-Path $i) {
        Copy-Item $i $ZipDir -Recurse -Force
        Write-Host "  + $i" -ForegroundColor DarkGray
    }
}
# Excluir logs de depuración (solo datos útiles: workflows/ y fallback_queue.json)
if (Test-Path (Join-Path $ZipDir "logs")) {
    Get-ChildItem (Join-Path $ZipDir "logs") -File | Where-Object { $_.Name -like "*.log*" -or $_.Name -eq "flask.log" } | Remove-Item -Force
}
Compress-Archive -Path $ZipDir -DestinationPath $Zip -Force
Remove-Item $ZipDir -Recurse -Force

$size = [math]::Round((Get-Item $Zip).Length / 1MB, 2)
Write-Host ""
Write-Host "=== Exportado: $Zip ($size MB)" -ForegroundColor Green
Write-Host "Importar en la nueva máquina: descomprime sobre platform/ y arranca run-native.ps1"
