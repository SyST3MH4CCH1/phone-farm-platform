# run-native.ps1 — Arranca la Phone Farm NATIVA (sin Docker) en este Mini PC.
#
#   platform     -> python -m phonefarm.platform   (venv: platform\.venv)
#   moneyprinter -> python main.py                  (venv: third_party\MoneyPrinterTurbo\.venv-mpt)
#   ADB          -> el del host (platform-tools), directo — sin host.docker.internal
#
# Uso:  powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1
#       powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1 -Stop
#
# Requisitos previos (una vez): python instalado, adb en PATH, ffmpeg en PATH.

param([switch]$Stop)

$ErrorActionPreference = "Stop"
$Root = Join-Path $PSScriptRoot ".."
$Venv = Join-Path $Root ".venv"
$MptVenv = Join-Path $Root "third_party\MoneyPrinterTurbo\.venv-mpt"

function Start-Venv { param($Path, $ReqFile)
    if (-not (Test-Path (Join-Path $Path "Scripts\python.exe"))) {
        Write-Host "  Creando venv $Path ..." -ForegroundColor Yellow
        python -m venv $Path
    }
    $py = Join-Path $Path "Scripts\python.exe"
    if ($ReqFile -and (Test-Path $ReqFile)) {
        & $py -m pip install --quiet -r $ReqFile
    }
    return $py
}

if ($Stop) {
    Write-Host "=== Deteniendo Phone Farm nativa ===" -ForegroundColor Cyan
    Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -match "phonefarm.platform|MoneyPrinterTurbo.*main.py" -or $_.Path -like "*phone-farm*"
    } | Stop-Process -Force
    Write-Host "Procesos detenidos."
    exit 0
}

# ADB disponible?
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Warning "adb no está en PATH — instala platform-tools o agrégalo."
}

Write-Host "=== Phone Farm NATIVA ===" -ForegroundColor Cyan

# 1) Plataforma (Flask + MCP :5001 + taktik-bot)
$py = Start-Venv $Venv (Join-Path $Root "requirements.txt")
Write-Host "  Arrancando plataforma (Flask :5000 + MCP :5001)..." -ForegroundColor Yellow
Push-Location $Root
try {
    Start-Process -FilePath $py -ArgumentList "-m", "phonefarm.platform" -WorkingDirectory $Root -WindowStyle Hidden
} finally { Pop-Location }

# 2) MoneyPrinterTurbo (API en 127.0.0.1:8080 — CVE-2025-7897 mitigado)
$mptPy = Start-Venv $MptVenv (Join-Path $Root "third_party\MoneyPrinterTurbo\requirements.txt")
Push-Location (Join-Path $Root "third_party\MoneyPrinterTurbo")
try {
    if (-not (Test-Path "config.toml")) { Copy-Item "config.example.toml" "config.toml" }
    # Asegurar listen 127.0.0.1 (config segura) — si el usuario lo cambió, se respeta
    Start-Process -FilePath $mptPy -ArgumentList "main.py" -WorkingDirectory (Get-Location) -WindowStyle Hidden
} finally { Pop-Location }

# 3) Regenerar config de MPT con las keys del .env (pexels, llm) y copiar como config.toml
Write-Host "  Generando config segura de MPT..." -ForegroundColor Yellow
$env:IN_DOCKER = "0"
& $py (Join-Path $Root "scripts\gen_mpt_config.py") | Out-Null
Copy-Item (Join-Path $Root "mpt-config.toml") (Join-Path $Root "third_party\MoneyPrinterTurbo\config.toml") -Force

Write-Host "`n=== Listo ===" -ForegroundColor Green
Write-Host "  Dashboard:  http://127.0.0.1:5000   (Flask, con panel de contenedores)"
Write-Host "  MCP agents:  http://127.0.0.1:5001/mcp"
Write-Host "  MPT API:     http://127.0.0.1:8080/docs (solo loopback)"
Write-Host "  ADB:         directo del host — adb devices"
Write-Host "  Detener:     run-native.ps1 -Stop"
