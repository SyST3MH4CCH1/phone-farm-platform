# INSTALACIÓN Y EJECUCIÓN — Windows nativo (host actual)

Documento operativo verificado en este checkout el **2026-10-02**. Cubre lo necesario para clonar el repo y tener los servicios levantados sin Docker ni dependencias externas no documentadas.

> Para el camino "todo-en-uno" sigue siendo válido `platform/scripts/install-all.ps1` (sólo en host con Docker). Aquí está la versión para host sin Docker y sin VS Build Tools.

## 1. Requisitos

| Componente | Versión verificada | Notas |
|---|---|---|
| Windows | 10.0.26100 (x64) | cualquier Windows 10+ en x64/amd64 sirve |
| Python | 3.12 (CPython, embebido o sistema) | se usa vía `platform/.venv` |
| Node.js | 22 LTS o 24 (este host usa 24.20.0) | ver §3 para la nota sobre Node 24 |
| Bun | 1.1+ (este host usa 1.3.11) | sólo dev/CI; el frontend se ejecuta con Bun |
| ADB | platform-tools | opcional; el panel funciona sin dispositivos conectados |
| Visual Studio Build Tools | **NO requerido** | ver §3 |

## 2. Gestores de paquetes y lockfiles

El repo mantiene **dos lockfiles** por diseño:

- `bun.lock` — gestor canónico para dev y para CI typecheck/build (`bun install --frozen-lockfile`).
- `package-lock.json` — gestor para test-node y audit-deps (`npm ci`).

Ambos reflejan el mismo árbol; CI los regenera por separado porque `bun install` y `npm ci` resuelven grafos ligeramente distintos.

## 3. Instalación limpia desde checkout

### 3.1. Backend Python (Flask + MCP + taktik-bot)

```powershell
# Crear el venv (si no existe) e instalar deps
cd platform
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

### 3.2. Frontend y servidor Express

```powershell
# gestor canónico: Bun
bun install --ignore-scripts --frozen-lockfile

# alternativa: npm
# npm ci --ignore-scripts
```

> **`--ignore-scripts` es necesario** en hosts sin Visual Studio Build Tools. `better-sqlite3@13.0.3` ya envía el binding nativo precompilado en `node_modules/better-sqlite3/prebuilds/<platform>-<arch>.node`. Sin embargo, npm y Bun lanzan `node-gyp rebuild` por defecto cuando hay `binding.gyp` en el paquete. El flag desactiva ese fallback y deja que `lib/binding.js` use directamente el prebuild.

Verificación:

```powershell
# better-sqlite3 debe cargar sin copiar .node manualmente
node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.exec('create table t(x)');d.prepare('insert into t values (1)').run();console.log(d.prepare('select count(*) c from t').get())"
# salida esperada: { c: 1 }
```

## 4. Configuración de secretos (`.env`)

El instalador de un solo comando `platform/scripts/install-all.ps1` los genera automáticamente. Si se hace manual:

- `.env` (raíz): `PHONE_FARM_INTERNAL_TOKEN`, `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `MPT_API_KEY`, `LLM_PROVIDER`, `FLASK_BASE`, `PEXELS_API_KEY`, `MINIMAX_API_KEY`, `OPENAI_API_KEY`, `KIMI_API_KEY`, `DATAIMPULSE_USER`, `DATAIMPULSE_PASS`, `EXPOSE_SOURCE`, `PORT=4100`, `NODE_ENV=development`, `COOKIE_SECURE=false`.
- `platform/.env`: `INTERNAL_TOKEN` (= al anterior), `MPT_API_KEY`, `LLM_PROVIDER`, `PHONE_FARM_DATA_DIR=./`, `FLASK_PORT=5000`, `MCP_PORT=5001`, `ALLOWED_ORIGINS`, `ADB_HOST`, `ADB_PORT`, `PANDA_GRID_STATUS`, `TAKTIK_DIR`, `PHONEFARM_KEY_PROVIDER=file`, `PHONEFARM_DB_PATH`, `PHONEFARM_MASTER_KEY_PATH`, `PHONE_FARM_MAX_CONTENT_LENGTH`, claves externas del LLM, `DATAIMPULSE_USER`/`DATAIMPULSE_PASS`.

`platform/scripts/rotate-internal-secrets.ps1` regenera los internos (`ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `INTERNAL_TOKEN`/`PHONE_FARM_INTERNAL_TOKEN`, `MPT_API_KEY`) y deja los externos a mano.

## 5. Arranque y parada

### Persistente (recomendado para revisión; sobrevive a la sesión de shell)

```powershell
# Flask + MCP
$Platform = (Resolve-Path .\platform).Path
$VenvPy   = Join-Path $Platform ".venv\Scripts\python.exe"
$env:MCP_ENABLED = "1"; $env:MCP_PORT = "5001"
Start-Process -FilePath $VenvPy `
    -ArgumentList @("-m","phonefarm.platform") `
    -WorkingDirectory $Platform -WindowStyle Hidden `
    -RedirectStandardOutput "$Platform\logs\flask.out.log" `
    -RedirectStandardError  "$Platform\logs\flask.err.log"

# Express
$Bun = (Get-Command bun).Source
Start-Process -FilePath $Bun `
    -ArgumentList @("run","dev") `
    -WorkingDirectory (Resolve-Path .).Path -WindowStyle Hidden `
    -RedirectStandardOutput "dev-server.log" `
    -RedirectStandardError  "dev-server.err.log"
```

**Alcance real**: ambos procesos son independientes de la sesión de shell, pero **NO son servicios de Windows**. Se pierden al reiniciar el equipo, cerrar sesión o matar el proceso manualmente. Para mantenerlos vivos más allá, instala un servicio real (`sc create …`) o una tarea programada (`schtasks /create /sc onstart …`) — ambos NO están en este checkout por decisión.

### Verificación de servicios

| Puerto | Servicio | Healthcheck |
|---|---|---|
| 4100 | Express (panel + API proxy) | `curl http://127.0.0.1:4100/healthz` → `{"status":"ok"}` |
| 4100 | Express readyz | `curl http://127.0.0.1:4100/readyz` → JSON con `checks.db`, `checks.flask`, `checks.mpt` |
| 5000 | Flask + panel HTML | `curl -H "X-Internal-Auth: $env:PHONE_FARM_INTERNAL_TOKEN" http://127.0.0.1:5000/api/stats` |
| 5001 | MCP server | `curl -X POST http://127.0.0.1:5001/mcp` → 401 sin Bearer |
| 5037 | ADB daemon | `adb devices` |

### Healthchecks: qué significa cada uno

- `/healthz` (Express): liveness; siempre 200 si el proceso responde.
- `/readyz` (Express): readiness combinado de db (SQLite `SELECT 1`), flask (Flask `/readyz`), mpt (`MoneyPrinter` `/ping`). Devuelve **200** si los 3 responden, **503** si alguno falla. El campo `checks.mpt:false` (mpt apagado) implica **503** (política vigente; el pipeline de generación de vídeo requiere MPT).
- `/readyz` (Flask): readiness de BD + master key + workers del scheduler.
- **MPT es opcional para la operatividad del panel** (login, cuentas, proxies, cola) pero **obligatorio para la generación y publicación de vídeo**. Si MPT está apagado y necesitas vídeo: `platform/scripts/install-vender3.py` + `.venv-mpt` (no aplicado por defecto).

## 7. Cómo comprobar `better-sqlite3`

```powershell
node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.exec('create table t(x)');d.prepare('insert into t values (1)').run();console.log(d.prepare('select count(*) c from t').get())"
```

Si falla con `Could not locate the bindings file`, ejecuta `bun install --ignore-scripts` (o `npm install --ignore-scripts`) y vuelve a probar. Si persiste, instala Visual Studio Build Tools 2022 con el workload "Desktop development with C++".

## 8. Logs

| Archivo | Qué contiene |
|---|---|
| `dev-server.log` | Vite + tsx + Express (stdout) |
| `dev-server.err.log` | Vite + tsx + Express (stderr) |
| `platform/logs/flask.out.log` | Flask (stdout) |
| `platform/logs/flask.err.log` | Flask (stderr) |
| `platform/logs/platform.log` | Logs rotados de la plataforma Python |
| `platform/logs/express.{out,err}.log` | (legacy) |

Tail en vivo: `Get-Content <path> -Tail 30 -Wait`.

## 9. Cómo detenerlos

```powershell
# Buscar PIDs por línea de comando
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @("node.exe","python.exe") -and
    ($_.CommandLine -match "phonefarm\.platform|tsx server")
} | Select-Object ProcessId, CommandLine

# Detenerlos
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @("node.exe","python.exe") -and
    ($_.CommandLine -match "phonefarm\.platform|tsx server")
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 10. Qué ocurre al reiniciar el host

- `node.exe`/`python.exe` arrancados por `Start-Process` se pierden al apagar Windows.
- El `boot.json` permanece; los `users`, `accounts`, `proxies`, `jobs` de la BD SQLite (`platform/data/phonefarm.db`) sobreviven.
- `master.key` (32 bytes) sobrevive. Si se borra, las contraseñas cifradas en la BD son irrecuperables.
- Los `.env` sobreviven.
- No hay servicios de Windows ni startup hooks configurados — todo arranca manual.

## 11. Tests reproducibles

```powershell
# Node (vitest, debe quedar 7 files / 66 tests OK)
bun run test

# Python (pytest, debe quedar 53/53 OK)
.\platform\.venv\Scripts\python.exe -m pytest platform/tests

# typecheck
bun run typecheck

# build
bun run build

# bandit (mayor en 0)
.\platform\.venv\Scripts\python.exe -m bandit -q -ll -r platform/phonefarm
```

## 12. Lo que este documento NO valida

- Rotación de claves externas (Pexels, MiniMax, Kimi, OpenAI, DataImpulse, Instagram) — se hace en cada portal a mano. Ver `docs/SECURITY-ROTATION-2026-08-13.md`.
- Reproducción de GitHub Actions runs — el host no tiene `gh` autenticado; CI corre en GitHub Actions.
- Pip-audit local — excede 5 min en este host; CI usa 15 min en Linux.