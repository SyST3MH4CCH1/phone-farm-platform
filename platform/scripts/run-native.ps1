<#
.SYNOPSIS
  run-native.ps1 — Arranca la Phone Farm NATIVA (sin Docker) en este Mini PC.

    platform      -> python -m phonefarm.platform   (venv: platform\.venv)
    moneyprinter  -> python main.py                  (venv: third_party\MoneyPrinterTurbo\.venv-mpt)
    ADB           -> el del host (platform-tools), directo, sin host.docker.internal

  Uso:  powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1
        powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1 -Stop

  Requisitos previos (una vez): python instalado (C:\Python312), adb en PATH, ffmpeg Gyan.
  Nota: guardar este archivo en UTF-8 SIN BOM y ASCII (los em-dash rompen PS 5.1).
#>

param([switch]$Stop, [string]$Python = "", [switch]$ReinstallDeps)

$ErrorActionPreference = "Stop"
$Root     = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
# Venv de la plataforma: platform\.venv (python 3.12, Windows). Arquitectura objetivo.
$Venv     = Join-Path $Root ".venv"
$MptRoot  = Join-Path $Root "third_party\MoneyPrinterTurbo"
$MptVenv  = Join-Path $MptRoot ".venv-mpt"

# Python de bootstrap AUTO-DETECTADO (portable: ya no depende de C:\Python312).
# Orden: -Python <ruta> > `py -3.12` > `python` en PATH > C:\Python312 (fallback legado).
if (-not $Python) {
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        $pyVer = & $pyCmd.Source -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $pyVer) { $Python = $pyVer.Trim() }
    }
}
if (-not $Python) {
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd) { $Python = $pyCmd.Source }
}
# Python instalado por winget (Python.Python.3.12) — rutas típicas
foreach ($p in @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
)) {
    if (-not $Python -and (Test-Path $p)) { $Python = $p }
}
if (-not $Python -and (Test-Path "C:\Python312\python.exe")) {
    $Python = "C:\Python312\python.exe"
}
if (-not $Python) {
    Write-Error "Python 3.12 no encontrado. Instala Python o pasa -Python C:\ruta\python.exe"
}
Write-Host "  Python bootstrap: $Python" -ForegroundColor DarkGray
$PyBootstrap = $Python

function Start-Venv {
    param($Path, $ReqFile)
    $created = $false
    if (-not (Test-Path (Join-Path $Path "Scripts\python.exe"))) {
        Write-Host "  Creando venv $Path ..." -ForegroundColor Yellow
        & $PyBootstrap -m venv $Path
        $created = $true
    }
    $py = Join-Path $Path "Scripts\python.exe"
    # ponytail: pip install solo al crear el venv (o con -ReinstallDeps).
    # Antes reinstalaba en cada arranque y el reinicio era lento sin motivo.
    if ($ReqFile -and (Test-Path $ReqFile) -and ($created -or $ReinstallDeps)) {
        & $py -m pip install --quiet -r $ReqFile
    }
    return $py
}

function Find-FarmProcesses {
    # Get-Process NO expone CommandLine; hay que consultar Win32_Process.
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "python.exe" -and (
            $_.CommandLine -match "phonefarm\.platform" -or
            $_.CommandLine -match "MoneyPrinterTurbo.*main\.py"
        )
    }
}

if ($Stop) {
    Write-Host "=== Deteniendo Phone Farm nativa ===" -ForegroundColor Cyan
    Find-FarmProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Procesos detenidos."
    exit 0
}

# ADB disponible?
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Warning "adb no esta en PATH - instala platform-tools o agregalo."
}

Write-Host "=== Phone Farm NATIVA ===" -ForegroundColor Cyan

# 0) Eliminar duplicados/huerfanos. Un arranque anterior pudo dejar procesos del
#    Python del SISTEMA usurpando los puertos, impidiendo que los venvs bindeen.
$stale = Find-FarmProcesses
if ($stale) {
    Write-Host "  Limpiando procesos phonefarm previos ($($stale.Count))..." -ForegroundColor Yellow
    $stale | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

# 1) Generar config de MPT ANTES de arrancarlo (keys del .env + ffmpeg real).
Write-Host "  Generando config segura de MPT..." -ForegroundColor Yellow
$env:IN_DOCKER = "0"
& $PyBootstrap (Join-Path $Root "scripts\gen_mpt_config.py") | Out-Null
$genCfg = Join-Path $Root "mpt-config.toml"
# Preferir siempre el config generado (listen_host=127.0.0.1 y keys reales).
if (Test-Path $genCfg) {
    Copy-Item $genCfg (Join-Path $MptRoot "config.toml") -Force
} elseif (-not (Test-Path (Join-Path $MptRoot "config.toml"))) {
    Copy-Item (Join-Path $MptRoot "config.example.toml") (Join-Path $MptRoot "config.toml")
}

# 2) Plataforma (Flask :5000 + MCP :5001 + taktik-bot)
$py = Start-Venv $Venv (Join-Path $Root "requirements.txt")
Write-Host "  Arrancando plataforma (Flask :5000 + MCP :5001)..." -ForegroundColor Yellow
Push-Location $Root
try {
    Start-Process -FilePath $py -ArgumentList "-m", "phonefarm.platform" -WorkingDirectory $Root -WindowStyle Hidden
} finally { Pop-Location }

# 3) MoneyPrinterTurbo (API en 127.0.0.1:8080 - CVE-2025-7897 mitigado)
$mptPy = Start-Venv $MptVenv (Join-Path $MptRoot "requirements.txt")
Write-Host "  Arrancando MoneyPrinterTurbo (API :8080)..." -ForegroundColor Yellow
Push-Location $MptRoot
try {
    Start-Process -FilePath $mptPy -ArgumentList "main.py" -WorkingDirectory $MptRoot -WindowStyle Hidden
} finally { Pop-Location }

Write-Host ""
Write-Host "=== Listo ===" -ForegroundColor Green
Write-Host "  Dashboard:  http://127.0.0.1:5000   (Flask)"
Write-Host "  MCP agents: http://127.0.0.1:5001/mcp"
Write-Host "  MPT API:    http://127.0.0.1:8080/docs (solo loopback)"
Write-Host "  ADB:        directo del host - adb devices"
Write-Host "  Detener:    run-native.ps1 -Stop"
