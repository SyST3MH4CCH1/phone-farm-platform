<#
.SYNOPSIS
  install-all.ps1 - INSTALADOR UNICO de la Phone Farm Platform (todo automatico).

  Hace TODO sin intervencion manual:
    1. Instala prerequisitos con winget: Git, Node LTS, Python 3.12,
       ffmpeg Gyan (con NVENC), ADB platform-tools, scrcpy.
    2. Actualiza el PATH de la sesion (no hace falta reiniciar la terminal).
    3. Ejecuta setup-new-machine.ps1: crea .env, instala dependencias,
       arranca Flask+MCP+MPT, importa datos (si hay ZIP) y arranca el panel.

  USO (en la maquina nueva):
    git clone git@github.com:SyST3MH4CCH1/phone-farm-platform.git
    cd phone-farm-platform
    powershell -ExecutionPolicy Bypass -File platform\scripts\install-all.ps1

  OPCIONAL:
    -ImportZip C:\ruta\phonefarm-export-*.zip   (importar datos existentes)
    -SkipTools                                  (no instalar prerequisitos)

  NOTA: guardar este archivo en UTF-8 SIN BOM y SOLO ASCII (PS 5.1 rompe
  con caracteres no-ASCII). Requisito: Windows 10/11 con winget.
  Al terminar abre http://127.0.0.1:3000 y listo.
#>

param(
    [string]$ImportZip = "",
    [switch]$SkipTools
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Write-Host ""
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "  PHONE FARM - INSTALADOR UNICO (todo automatico)" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan

# ------------------------------------------------------------- winget check
if (-not $SkipTools) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget no disponible. Windows 11 lo incluye; en Win10 instala 'App Installer' desde la Store."
    }
    Write-Host "`n[1/3] Instalando prerequisitos con winget (puede tardar varios minutos)..." -ForegroundColor Yellow

    $tools = @(
        @{ id = "Git.Git";                       args = '--override "/VERYSILENT /NORESTART"' },
        @{ id = "OpenJS.NodeJS.LTS";             args = "" },
        @{ id = "Python.Python.3.12";            args = '--override "/quiet InstallAllUsers=0 PrependPath=1"' },
        @{ id = "Gyan.FFmpeg";                   args = "" },
        @{ id = "Google.PlatformTools";          args = "" },
        @{ id = "Genymobile.scrcpy";             args = "" }
    )
    foreach ($t in $tools) {
        Write-Host "  -> $($t.id) ..." -ForegroundColor DarkGray
        $ok = $false
        $cmd = "winget install --id $($t.id) --silent --accept-source-agreements --accept-package-agreements --disable-interactivity $($t.args)"
        try { Invoke-Expression $cmd 2>&1 | Out-Null; $ok = $true } catch { }
        if (-not $ok) {
            try { Invoke-Expression "winget install --id $($t.id) --silent --accept-source-agreements --accept-package-agreements $($t.args)" 2>&1 | Out-Null; $ok = $true } catch { }
        }
        if ($ok) { Write-Host "  OK  $($t.id)" -ForegroundColor DarkGreen }
        else     { Write-Host "  !!  $($t.id) no se instalo (puede que ya exista) - continuo" -ForegroundColor DarkYellow }
    }
}

# ------------------------------------------------------------- refresh PATH
Write-Host "`n[2/3] Actualizando PATH de la sesion..." -ForegroundColor Yellow
$machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
$user    = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machine;$user;$env:Path"

# ADB: si platform-tools se instalo pero no quedo en PATH, buscarlo
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    foreach ($p in @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools",
        "$env:LOCALAPPDATA\PlatformTools",
        "$env:USERPROFILE\platform-tools"
    )) {
        if (Test-Path (Join-Path $p "adb.exe")) { $env:Path += ";$p"; break }
    }
}
Write-Host "  OK  PATH listo (python/node/adb/ffmpeg en esta sesion)" -ForegroundColor DarkGreen

# ------------------------------------------------------------- setup
Write-Host "`n[3/3] Lanzando setup de la plataforma (deps + stack + panel)..." -ForegroundColor Yellow
$setupArgs = @()
if ($ImportZip) { $setupArgs += "-ImportZip `"$ImportZip`"" }
if ($SkipTools) { $setupArgs += "-SkipInstall" }
Push-Location $Root
try {
    if ($setupArgs.Count -gt 0) {
        powershell -NoProfile -ExecutionPolicy Bypass -File "platform\scripts\setup-new-machine.ps1" $setupArgs
    } else {
        powershell -NoProfile -ExecutionPolicy Bypass -File "platform\scripts\setup-new-machine.ps1"
    }
} finally { Pop-Location }

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Green
Write-Host "  INSTALACION COMPLETA" -ForegroundColor Green
Write-Host "  Panel: http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Green
Write-Host "  Siguiente paso: edita platform\.env y pon tus API keys"
Write-Host "  (MINIMAX_API_KEY, PEXELS_API_KEY) y reinicia con:"
Write-Host "  platform\scripts\run-native.ps1"
