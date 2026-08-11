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

# 2. Clones de terceros
$thirdParty = Join-Path $RepoPlatform "third_party"
New-Item -ItemType Directory -Force -Path $thirdParty | Out-Null
foreach ($repo in @(
    @{ Name = "taktik-bot"; Url = "https://github.com/masterFuf/taktik-bot.git" },
    @{ Name = "MoneyPrinterTurbo"; Url = "https://github.com/harry0703/MoneyPrinterTurbo.git" }
)) {
    $dest = Join-Path $thirdParty $repo.Name
    if (-not (Test-Path (Join-Path $dest ".git"))) {
        Write-Host "  Clonando $($repo.Name)..." -ForegroundColor Yellow
        git clone --depth 1 $repo.Url $dest
    } else {
        Write-Host "  $($repo.Name) ya clonado."
    }
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
Copy-Item (Join-Path $RepoPlatform ".env") (Join-Path $Root ".env") -Force
if (-not (Test-Path (Join-Path $Root ".env"))) { Copy-Item (Join-Path $RepoPlatform ".env.example") (Join-Path $Root ".env") }

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
