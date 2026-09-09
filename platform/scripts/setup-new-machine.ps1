<#
.SYNOPSIS
  setup-new-machine.ps1 — Despliega la Phone Farm COMPLETA en una máquina nueva
  (GPU dedicada + RAM). Un solo comando: verifica prerequisitos, crea .env,
  instala dependencias, arranca el stack y verifica los endpoints.

  Uso:
    git clone git@github.com:SyST3MH4CCH1/phone-farm-platform.git
    cd phone-farm-platform
    powershell -ExecutionPolicy Bypass -File platform\scripts\setup-new-machine.ps1

  Flags opcionales:
    -SkipInstall  : no reinstala npm/pip (si ya lo hiciste antes)
    -ImportZip    : ruta al phonefarm-export-*.zip para importar datos
    -Python       : ruta al python.exe (si no se auto-detecta)

  Requisitos previos (se verifican): Python 3.12, Node 20+, Git, adb, ffmpeg (NVENC),
  scrcpy, y conexión USB de los teléfonos.
#>

param(
    [switch]$SkipInstall,
    [string]$ImportZip = "",
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Write-Host "=== Setup Phone Farm en $Root ===" -ForegroundColor Cyan

# ---------------------------------------------------------------- 0. Pre-check
function Test-Cmd($name) {
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if ($c) { Write-Host "  ✓ $name  ($($c.Source))" -ForegroundColor DarkGreen }
    else    { Write-Host "  ✗ $name  NO ENCONTRADO" -ForegroundColor Red }
    return [bool]$c
}
Write-Host "`n[0/6] Prerequisitos:" -ForegroundColor Yellow
Test-Cmd git            | Out-Null
Test-Cmd node           | Out-Null
Test-Cmd npm            | Out-Null
Test-Cmd adb            | Out-Null
Test-Cmd ffmpeg         | Out-Null
$py = Test-Cmd python
if (-not $py) { Test-Cmd py | Out-Null }
$scrcpyOk = Test-Cmd scrcpy
if (-not $scrcpyOk) { Write-Host "  (scrcpy opcional: pon SCRCPY_EXE en .env)" -ForegroundColor DarkGray }
if (-not (Test-Cmd ffmpeg)) {
    Write-Host "  ffmpeg con NVENC recomendado: winget install Gyan.FFmpeg" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- 1. .env files
Write-Host "`n[1/6] Creando .env desde los ejemplos..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
    Write-Host "  + .env (raíz) — EDITA: ADMIN_PASSWORD, OPERATOR_PASSWORD, PHONE_FARM_INTERNAL_TOKEN" -ForegroundColor DarkGray
}
if (-not (Test-Path (Join-Path $Root "platform\.env"))) {
    Copy-Item (Join-Path $Root "platform\.env.example") (Join-Path $Root "platform\.env")
    Write-Host "  + platform\.env — EDITA: INTERNAL_TOKEN (mismo que el de la raíz), MINIMAX_API_KEY" -ForegroundColor DarkGray
}
# Lee un valor de un .env (sin comillas). $null si falta la clave.
function Get-EnvValue($Path, $Name) {
    $m = Select-String -Path $Path -Pattern "^$Name=(.*)$" -EA SilentlyContinue | Select-Object -First 1
    if (-not $m) { return $null }
    return $m.Matches[0].Groups[1].Value.Trim().Trim('"')
}
# Escribe (o añade) una clave en un .env.
function Set-EnvValue($Path, $Name, $Value) {
    $lines = @()
    if (Test-Path $Path) { $lines = @(Get-Content $Path) }
    $found = $false
    $lines = @($lines | ForEach-Object { if ($_ -match "^$Name=") { $found = $true; "$Name=`"$Value`"" } else { $_ } })
    if (-not $found) { $lines += "$Name=`"$Value`"" }
    $lines | Set-Content $Path
}
# Generar token compartido si alguno quedó vacío (o falta) y sincronizar ambos.
# ponytail: antes solo generaba cuando AMBOS estaban vacíos; un .env a medias
# quedaba con tokens distintos y Flask rechazaba todo.
$rootTok = Get-EnvValue (Join-Path $Root ".env") "PHONE_FARM_INTERNAL_TOKEN"
$platTok = Get-EnvValue (Join-Path $Root "platform\.env") "INTERNAL_TOKEN"
if (-not $rootTok -or -not $platTok) {
    if ($rootTok) { $tok = $rootTok } elseif ($platTok) { $tok = $platTok }
    else {
        $tok = & python -c "import secrets; print(secrets.token_urlsafe(32))" 2>$null
        if (-not $tok) { $tok = "pf_" + [guid]::NewGuid().ToString("N") }
    }
    Set-EnvValue (Join-Path $Root ".env") "PHONE_FARM_INTERNAL_TOKEN" $tok
    Set-EnvValue (Join-Path $Root "platform\.env") "INTERNAL_TOKEN" $tok
    Write-Host "  ✓ Token interno generado y sincronizado en ambos .env" -ForegroundColor Green
}

# Generar credenciales del panel fuertes si quedaron vacías (paso 2: el server
# NO arranca con passwords demo ni cortos — ver server/config.ts).
function New-StrongSecret {
    param([int]$Bytes = 24)
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    [Convert]::ToBase64String($buf).TrimEnd('=').Replace('+', 'x').Replace('/', 'y')
}
$envRootPath = Join-Path $Root ".env"
$generated = @()
foreach ($pair in @(@('ADMIN_PASSWORD', 'admin'), @('OPERATOR_PASSWORD', 'operator'))) {
    $name = $pair[0]
    $line = (Select-String -Path $envRootPath -Pattern "^$name=" -EA SilentlyContinue).Line
    # ponytail: regex en single-quote (las "" dentro de double-quote rompían el
    # parseo del script entero en HEAD — el instalador ni siquiera arrancaba).
    $rxEmpty = "^$name=`"`""
    $rxShort = '^' + $name + '=[^"]{0,15}$'
    if ($line -match $rxEmpty -or $line -match $rxShort) {
        $strong = New-StrongSecret
        (Get-Content $envRootPath -Raw) -replace "(?m)^$name=.*$", "$name=`"$strong`"" | Set-Content $envRootPath
        $generated += "$name=$strong"
        Write-Host "  ✓ $name generada (fuerte, aleatoria)" -ForegroundColor Green
    }
}
if ($generated.Count -gt 0) {
    # ponytail: antes el password generado solo vivía en .env y el usuario no lo
    # veía; se muestra UNA vez aquí para entrar al panel sin abrir el fichero.
    Write-Host "  GUARDA estas credenciales (solo se muestran una vez):" -ForegroundColor Yellow
    $generated | ForEach-Object { Write-Host "    $_" -ForegroundColor White }
}

# NODE_ENV obligatorio (server/config.ts se niega a arrancar sin él):
# fijar production si falta. Instalación fresca = despliegue, no dev.
if (-not (Get-EnvValue $envRootPath "NODE_ENV")) {
    Set-EnvValue $envRootPath "NODE_ENV" "production"
    Write-Host '  ✓ NODE_ENV="production" fijado en .env' -ForegroundColor Green
}

# ---------------------------------------------------------------- 2. npm
Write-Host "`n[2/6] Dependencias Node..." -ForegroundColor Yellow
if (-not $SkipInstall -and -not (Test-Path (Join-Path $Root "node_modules"))) {
    Push-Location $Root
    try { npm install --no-audit --no-fund 2>&1 | Select-Object -Last 2 }
    finally { Pop-Location }
    Write-Host "  ✓ npm install" -ForegroundColor Green
} else { Write-Host "  (node_modules ya existe o -SkipInstall)" }

# ---------------------------------------------------------------- 3. Stack Python
Write-Host "`n[3/6] Backend Python (Flask + MCP + MPT + venvs)..." -ForegroundColor Yellow
Push-Location $Root
try {
    if ($Python) { powershell -NoProfile -ExecutionPolicy Bypass -File "platform\scripts\run-native.ps1" -Python $Python }
    else { powershell -NoProfile -ExecutionPolicy Bypass -File "platform\scripts\run-native.ps1" }
} finally { Pop-Location }
Start-Sleep -Seconds 12

# ---------------------------------------------------------------- 4. Importar datos
if ($ImportZip) {
    Write-Host "`n[4/6] Importando datos desde $ImportZip..." -ForegroundColor Yellow
    if (-not (Test-Path $ImportZip)) { Write-Warning "ZIP no encontrado: $ImportZip — se omite" }
    else {
        $tmp = Join-Path $env:TEMP "pf-import"
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Expand-Archive $ImportZip $tmp -Force
        $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
        Copy-Item (Join-Path $inner.FullName "*") (Join-Path $Root "platform") -Recurse -Force
        Remove-Item $tmp -Recurse -Force
        Write-Host "  ✓ Datos importados (accounts/proxies/queue/sessions/videos)" -ForegroundColor Green
    }
} else { Write-Host "`n[4/6] Sin -ImportZip: arranca con datos vacíos (añade cuentas desde el panel)." -ForegroundColor DarkGray }

# ---------------------------------------------------------------- 5. Express (panel)
Write-Host "`n[5/6] Arrancando panel Express :3000..." -ForegroundColor Yellow
Push-Location $Root
try {
    $p = Start-Process -FilePath "npx" -ArgumentList "tsx","server.ts" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    Write-Host "  ✓ Express PID $($p.Id) — http://127.0.0.1:3000" -ForegroundColor Green
} finally { Pop-Location }
Start-Sleep -Seconds 8

# ---------------------------------------------------------------- 6. Verificación
Write-Host "`n[6/6] Verificación de endpoints..." -ForegroundColor Yellow
$checks = @(
    @{ n = "Flask  :5000";   u = "http://127.0.0.1:5000/api/stats" },
    @{ n = "Express:3000";   u = "http://127.0.0.1:3000/" },
    @{ n = "Panda  :/panda"; u = "http://127.0.0.1:3000/panda" }
)
foreach ($c in $checks) {
    try {
        $r = Invoke-WebRequest -Uri $c.u -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  ✓ $($c.n) -> $($r.StatusCode)" -ForegroundColor DarkGreen
    } catch {
        Write-Host "  ✗ $($c.n) -> sin respuesta" -ForegroundColor Red
    }
}
$adbCount = (adb devices 2>$null | Select-String -Pattern "\tdevice").Count
Write-Host "  dispositivos ADB detectados: $adbCount" -ForegroundColor DarkGreen

Write-Host ""
Write-Host "=== LISTO ===" -ForegroundColor Green
Write-Host "  Panel:  http://127.0.0.1:3000   (credenciales: las que definiste en .env)"
Write-Host "  Panda:  botón 'Panda' en el header (pantallas en vivo)"
Write-Host "  Docs:   docs\MIGRACION-GPU.md  (GPU/NVENC), docs\INTERCONEXION.md, MANUAL.md"
Write-Host "  Backup: platform\scripts\export-data.ps1  (para futuras migraciones)"
