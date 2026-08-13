<#
.SYNOPSIS
Rota los secretos INTERNOS de Phone Farm Platform (sin valores de terceros).

.DESCRIPTION
Genera y escribe en .env / platform/.env los siguientes secretos internos:
  - ADMIN_PASSWORD, OPERATOR_PASSWORD   (panel; se muestran UNA VEZ en consola)
  - PHONE_FARM_INTERNAL_TOKEN (raiz) <-> INTERNAL_TOKEN (platform/.env), sincronizados
  - MPT_API_KEY (nuevo; lo exige el endurecimiento de MoneyPrinterTurbo)

Preserva el resto de líneas de ambos .env, aplica ACL restrictiva (usuario + SYSTEM)
y NO escribe valores en ningún log ni documento. Los secretos externos (Pexels,
MiniMax, Kimi, OpenAI, DataImpulse, Instagram) se rotan manualmente en cada portal
(ver docs/SECURITY-ROTATION-2026-08-13.md).

.EXAMPLE
./platform/scripts/rotate-internal-secrets.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot          # .../platform
$Repo = Split-Path -Parent $Root                  # raíz del repo
$EnvRoot = Join-Path $Repo '.env'                 # .env raíz (Express)
$EnvPlatform = Join-Path $Root '.env'             # platform/.env (Flask)

foreach ($p in @($EnvRoot, $EnvPlatform)) {
    if (-not (Test-Path $p)) { throw "No existe $p — ejecuta primero setup-new-machine.ps1" }
}

function New-SecureValue {
    param([int]$Bytes = 32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $rng.GetBytes($buf)
    [Convert]::ToBase64String($buf).TrimEnd('=').Replace('+', 'x').Replace('/', 'y')
}

function Update-DotenvValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value
    )
    $lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $Path)
    $pattern = '^' + [regex]::Escape($Name) + '\s*='
    $idx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) { $idx = $i; break }
    }
    if ($idx -ge 0) { $lines[$idx] = "$Name=$Value" }
    else { $lines.Add("$Name=$Value") }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

function Lock-FileAcl {
    param([string]$Path)
    $who = "$env:USERDOMAIN\$env:USERNAME"
    & icacls $Path /inheritance:r /grant:r "${who}:(F)" "SYSTEM:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls falló sobre $Path" }
}

$adminPw  = New-SecureValue -Bytes 40
$opPw     = New-SecureValue -Bytes 40
$intTok   = New-SecureValue -Bytes 32
$mptKey   = New-SecureValue -Bytes 32

Update-DotenvValue $EnvRoot     'ADMIN_PASSWORD'            $adminPw
Update-DotenvValue $EnvRoot     'OPERATOR_PASSWORD'         $opPw
Update-DotenvValue $EnvRoot     'PHONE_FARM_INTERNAL_TOKEN' $intTok
Update-DotenvValue $EnvRoot     'MPT_API_KEY'               $mptKey
Update-DotenvValue $EnvPlatform 'INTERNAL_TOKEN'            $intTok
Update-DotenvValue $EnvPlatform 'MPT_API_KEY'               $mptKey

Lock-FileAcl $EnvRoot
Lock-FileAcl $EnvPlatform

Write-Host ''
Write-Host '=== Rotación de secretos internos completada ===' -ForegroundColor Green
Write-Host 'Archivos actualizados (ACL restringida: usuario + SYSTEM):'
Write-Host "  - $EnvRoot"
Write-Host "  - $EnvPlatform"
Write-Host ''
Write-Host 'NUEVAS CREDENCIALES DEL PANEL (anótalas ahora; no se vuelven a mostrar):' -ForegroundColor Yellow
Write-Host "  ADMIN_USERNAME:   $((Get-Content $EnvRoot | Select-String '^ADMIN_USERNAME=').ToString().Split('=')[1])"
Write-Host "  ADMIN_PASSWORD:   $adminPw"
Write-Host "  OPERATOR_PASSWORD: $opPw"
Write-Host ''
Write-Host 'PENDIENTE (manual): rotar claves externas Pexels/MiniMax/Kimi/OpenAI/DataImpulse'
Write-Host '  y sesiones Instagram. Ver docs/SECURITY-ROTATION-2026-08-13.md' -ForegroundColor Cyan
