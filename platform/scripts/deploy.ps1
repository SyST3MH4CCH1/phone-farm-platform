# deploy.ps1 — Despliega la Phone Farm Platform en un directorio destino con Docker.
#
#   1. Verifica Docker Desktop
#   2. Clona taktik-bot y MoneyPrinterTurbo (si faltan)
#   3. Crea .env (desde .env.example) y mpt-config.toml
#   4. Copia la plataforma al destino (junction para third_party)
#   5. docker compose up -d --build
#
# Uso:  powershell -ExecutionPolicy Bypass -File platform\scripts\deploy.ps1
#       powershell ... -Root D:\phone-farm   (destino distinto del default)

param(
    [string]$Root = (Join-Path $PWD "phone-farm"),
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$RepoPlatform = Join-Path $PSScriptRoot ".."

Write-Host "=== Phone Farm Platform — Deploy ===" -ForegroundColor Cyan

# 1. Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker no encontrado. Instala Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# 2. Clones de terceros — fijados a los commits de platform/third_party.lock
# (Paso 8/13). Clon COMPLETO (no shallow): el checkout del commit del lock
# requiere el historial; un clon --depth 1 falla silenciosamente y deja el
# checkout en HEAD de upstream sin verificar (INF-01).
$thirdParty = Join-Path $RepoPlatform "third_party"
New-Item -ItemType Directory -Force -Path $thirdParty | Out-Null
$repos = @(
    @{ Name = "taktik-bot";         Url = "https://github.com/masterFuf/taktik-bot.git";        Commit = "c2b7489" },
    @{ Name = "MoneyPrinterTurbo";  Url = "https://github.com/harry0703/MoneyPrinterTurbo.git"; Commit = "254cd02" }
)
foreach ($repo in $repos) {
    $dest = Join-Path $thirdParty $repo.Name
    if (-not (Test-Path (Join-Path $dest ".git"))) {
        Write-Host "  Clonando $($repo.Name)..." -ForegroundColor Yellow
        git clone $repo.Url $dest
        if ($LASTEXITCODE -ne 0) { throw "No se pudo clonar $($repo.Name) desde $($repo.Url)" }
    } else {
        Write-Host "  $($repo.Name) ya clonado."
    }
    # Fijar el commit del lock; FALLA si el checkout no coincide (fail-closed).
    git -C $dest checkout --detach $repo.Commit
    if ($LASTEXITCODE -ne 0) { throw "No se pudo fijar $($repo.Name) a $($repo.Commit) (third_party.lock)" }
    $head = (git -C $dest rev-parse --short=7 HEAD) -join ""
    if ($head -ne $repo.Commit) { throw "$($repo.Name) quedó en $head, esperado $($repo.Commit) (third_party.lock)" }
    Write-Host "  $($repo.Name) fijado a $($repo.Commit) (third_party.lock)." -ForegroundColor DarkGreen
}

# Paso 8: aplicar el parche de endurecimiento de MPT (idempotente).
# El fallo del parche ABORTA el deploy: publicar MPT sin verify_token
# invalida PF-SEC-003/PF-SEC-008 (INF-02).
Push-Location $RepoPlatform
try {
    python scripts\apply-mpt-patch.py --check 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Aplicando parche de endurecimiento a MoneyPrinterTurbo..." -ForegroundColor Yellow
        python scripts\apply-mpt-patch.py
        if ($LASTEXITCODE -ne 0) { throw "El parche de endurecimiento de MPT no se pudo aplicar — deploy abortado" }
    } else {
        Write-Host "  Parche de endurecimiento de MPT ya aplicado." -ForegroundColor DarkGreen
    }
} finally {
    Pop-Location
}

# 3. .env y config MPT
$envFile = Join-Path $RepoPlatform ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $RepoPlatform ".env.example") $envFile
    Write-Host "  .env creado (edítalo con tus claves)." -ForegroundColor Yellow
}
Push-Location $RepoPlatform
try {
    python scripts\gen_mpt_config.py
} finally {
    Pop-Location
}

# 4. Materializar en $Root (estructura del plan maestro)
Write-Host "  Materializando plataforma en $Root ..."
New-Item -ItemType Directory -Force -Path (Join-Path $Root "sessions")   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "videos")     | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs")       | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "templates")  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "scripts")    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "data")       | Out-Null

# Paquete Python (platform.py dentro de phonefarm/ — evita el shadowing del stdlib)
Copy-Item -Recurse (Join-Path $RepoPlatform "phonefarm") (Join-Path $Root "phonefarm") -Force

foreach ($f in @("requirements.txt",".env.example","accounts.json","proxies.json","queue.json",
                 "content_profiles.json",
                 "Dockerfile","docker-compose.yml",".dockerignore","mpt-config.toml")) {
    Copy-Item (Join-Path $RepoPlatform $f) (Join-Path $Root $f) -Force
}
Copy-Item (Join-Path $RepoPlatform "templates\dashboard.html") (Join-Path $Root "templates") -Force
Copy-Item (Join-Path $RepoPlatform "scripts\docker-entrypoint.sh") (Join-Path $Root "scripts") -Force
# Copiar .env del repo si existe; si no, sembrar desde .env.example (INF-14:
# antes el Copy-Item fallaba con EAP=Stop y el fallback era código muerto).
$repoEnv = Join-Path $RepoPlatform ".env"
if (Test-Path $repoEnv) {
    Copy-Item $repoEnv (Join-Path $Root ".env") -Force
} elseif (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $RepoPlatform ".env.example") (Join-Path $Root ".env")
    Write-Host "  .env creado desde .env.example (edítalo con tus claves)." -ForegroundColor Yellow
}

# Junction para third_party (mismo disco: sin copiar cientos de MB)
$tpTarget = Join-Path $Root "third_party"
if (-not (Test-Path $tpTarget)) {
    cmd /c mklink /J "`"$tpTarget`"" "`"$thirdParty`"" | Out-Null
    Write-Host "  Junction third_party creada."
}

# 5. Compose up
Write-Host "=== docker compose up ===" -ForegroundColor Cyan
Push-Location $Root
try {
    if ($NoBuild) {
        docker compose up -d
    } else {
        docker compose up -d --build
    }
} finally {
    Pop-Location
}

# Puerto del dashboard (compatible PowerShell 5.1)
$flaskPort = "5000"
$envLine = Get-Content (Join-Path $Root '.env') -ErrorAction SilentlyContinue | Select-String '^FLASK_PORT='
if ($envLine) { $flaskPort = ($envLine.ToString() -split '=', 2)[1].Trim() }

Write-Host "`n=== Listo ===" -ForegroundColor Green
Write-Host "  Dashboard:   http://127.0.0.1:$flaskPort"
Write-Host "  MPT API:     http://127.0.0.1:8080/docs (solo loopback)"
Write-Host "  Logs:        docker compose -f $Root\docker-compose.yml logs -f"
