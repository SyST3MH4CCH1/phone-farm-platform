# Phone Farm Platform — Backend Python (real)

Backend **real** de la Phone Farm: generación de Reels con **MoneyPrinterTurbo**, publicación con **instagrapi**, engagement con **taktik-bot**, proxies SOCKS5 **DataImpulse** y control ADB — todo orquestado desde un Mini PC Windows con **Docker**.

> Reemplaza los mocks del servidor Express (`server.ts`). El dashboard React del repo puede apuntar a esta API (`bridge_config → 127.0.0.1:5000`).

## Arquitectura

```
┌────────────────────────── Mini PC Windows ───────────────────────────┐
│                                                                      │
│  Browser (Dashboard)  ──►  platform (Flask :5000)                    │
│  http://127.0.0.1:5000        │  ├─ /api/*        (11 endpoints)     │
│                               │  ├─ /stream/logs  (SSE en vivo)      │
│                               │  └─ /videos/<id>  (preview MP4)      │
│                               ▼                                      │
│                    ┌────────────────────────────┐                    │
│                    │  generator.py              │                    │
│                    │  └─► moneyprinter :8080    │  (SOLO loopback —  │
│                    │      (FastAPI, config      │   CVE-2025-7897)   │
│                    │       generada segura)     │                    │
│                    ├────────────────────────────┤                    │
│                    │  publisher.py (instagrapi) │◄─ sesión persistida│
│                    │  └─► Instagram (proxy 1:1) │   sessions/*.json  │
│                    ├────────────────────────────┤                    │
│                    │  engagement.py (taktik-bot)│                    │
│                    │  └─► adb ──► teléfonos     │◄─ ADB server host  │
│                    └────────────────────────────┘                    │
│                                                                      │
│  Datos: C:\phone-farm\ (accounts.json, proxies.json, queue.json,    │
│         sessions\, videos\, logs\ — volumen ./data en Docker)        │
└──────────────────────────────────────────────────────────────────────┘
```

## Puesta en marcha (Docker — recomendado)

```powershell
powershell -ExecutionPolicy Bypass -File platform\scripts\deploy.ps1
```

El script: verifica Docker → clona `taktik-bot` y `MoneyPrinterTurbo` → crea `.env` y la config segura de MPT → materializa `C:\phone-farm\` → `docker compose up -d --build`.

1. **Edita `platform/.env`**: `KIMI_API_KEY` (o `OPENAI_API_KEY`), `DATAIMPULSE_USER/PASS`, `FLASK_PORT`.
2. **Pexels**: pega tus keys en `C:\phone-farm\mpt-config.toml` (`pexels_api_keys = ["..."]`).
3. Conecta los teléfonos al hub USB; en el host: `adb devices` → `adb -s <serial> tcpip 5555`.
4. `http://127.0.0.1:5000` → dashboard.

> ⚠️ **ADB en Docker Desktop:** el contenedor usa `ADB_HOST=host.docker.internal:5037` — el server adb debe correr en el host (platform-tools).

### Sin Docker (desarrollo local)

```powershell
cd platform
python -m venv venv; .\venv\Scripts\Activate
pip install -r requirements.txt
pip install -r third_party\taktik-bot\requirements.txt
# MoneyPrinterTurbo: python main.py (API en 127.0.0.1:8080) — config segura:
#   copia config.example.toml a config.toml y pon listen_host = "127.0.0.1"
python scripts\gen_mpt_config.py   # o edita mpt-config.toml
python platform.py                 # API en http://127.0.0.1:5000
```

## Pipeline de creación de contenido (v2 — aprobación humana)

```
keyword + nicho ──► [scripting] guión+caption+hashtags (LLM o plantilla)
        ──► [awaiting_approval]  ✍️ revisar el draft
        ──► ✅ approve ──► [generating] MPT (script+terms provistos, sin LLM propio)
        ──► [publishing] instagrapi ──► published
        ──► ❌ reject ──► rejected
        └── scheduler: jobs con scheduled_time se procesan solos
```

- **Perfiles de nicho** (`content_profiles.json`): hashtags, plantilla de caption, tono LLM, voz TTS, terms de materiales. CRUD vía `/api/content/profiles`.
- **Aprobación**: `GET /api/drafts` → `POST /api/queue/<id>/approve` | `/reject`.
- **auto_approve=true** salta la revisión (full-auto).
- **Sin LLM en MPT**: el guión y los terms se generan en la plataforma y se pasan a MPT (`video_script` + `video_terms`) — MPT solo necesita `pexels_api_keys`.

## MCP server (agentes) — puerto 5001

La plataforma real expone **14 tools MCP** en `http://127.0.0.1:5001/mcp` (Streamable HTTP): `create_content_job`, `list_jobs`, `get_drafts`, `approve_job`, `reject_job`, `generate_script_preview`, `list_content_profiles`, `create_content_profile`, `get_stats`, `list_accounts`, `start_bot`, `stop_bot`, `list_proxies`, `get_logs`.

```bash
# Ejemplo: un agente crea contenido y lo aprueba
curl -s -X POST http://127.0.0.1:5001/mcp -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_content_job","arguments":{"keyword":"recetas rapidas","auto_approve":false}}}'
```

> El MCP del Express (:3000) opera datos mock; **el de la plataforma (:5001) opera los datos reales**.

## Endpoints (11 del plan + pipeline v2)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/accounts` | Lista cuentas |
| POST | `/api/accounts` | Crea cuenta `{username,password,device_serial,proxy_id}` |
| DELETE | `/api/accounts/<id>` | Elimina cuenta (detiene su bot) |
| GET | `/api/proxies` | Lista proxies con IP pública actual (cache 60 s) |
| POST | `/api/proxies` | Agrega credencial `{host,port,user,pass}` |
| GET | `/api/queue` | Lista cola |
| POST | `/api/queue` | Agrega job `{keyword,target_account}` |
| POST | `/api/queue/next` | Procesa siguiente job (genera + publica, background) |
| POST | `/engagement/start` | Inicia taktik-bot `{account_id}` |
| POST | `/engagement/stop` | Detiene taktik-bot `{account_id}` |
| GET | `/api/stats` | `videos_subidos, acciones_hoy, errores, cpu, ram, bots, proxies` |
| GET | `/api/drafts` | Drafts esperando aprobación (script + caption) |
| POST | `/api/queue/<id>/approve` · `/reject` | Aprueba/rechaza el guión del draft |
| GET/POST/DELETE | `/api/content/profiles` | CRUD de perfiles de nicho |
| POST | `/api/content/preview` | Vista previa guión+caption sin encolar |
| GET | `/` | Dashboard (`templates/dashboard.html`) |
| GET | `/stream/logs` | SSE (tail de `logs/platform.log`) |
| GET | `/api/adb/config` · `/api/auth/me` | Compatibilidad dashboard React |

### Pruebas cURL

```bash
BASE=http://127.0.0.1:5000

curl -s $BASE/api/accounts
curl -s -X POST $BASE/api/accounts -H "Content-Type: application/json" \
  -d '{"username":"mi_cuenta_01","password":"pass_real","device_serial":"192.168.1.105:5555","proxy_id":"proxy_01"}'
curl -s -X DELETE $BASE/api/accounts/acc_02

curl -s $BASE/api/proxies
curl -s -X POST $BASE/api/proxies -H "Content-Type: application/json" \
  -d '{"host":"gw.dataimpulse.com","port":10001,"user":"tu_user","pass":"tu_pass"}'

curl -s $BASE/api/queue
curl -s -X POST $BASE/api/queue -H "Content-Type: application/json" \
  -d '{"keyword":"decoracion sala moderna minimalista","target_account":"acc_01"}'
curl -s -X POST $BASE/api/queue/next          # → 202 (background)

curl -s -X POST $BASE/engagement/start -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'
curl -s -X POST $BASE/engagement/stop  -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'

curl -s $BASE/api/stats
curl -sN $BASE/stream/logs                    # SSE en vivo
```

## Seguridad operativa (implementada en el código)

- **Aislamiento 1:1** — `engagement.start_bot()` y `publisher` validan proxy dedicado + dispositivo único por cuenta.
- **Warmup progresivo** — `warmup_day ≤ 7 → 30 acciones/día; 8–14 → 50; >14 → 100` (`engagement.daily_limits`).
- **Sesiones IG** — `login_once()` SOLO en setup inicial; después se reutiliza `sessions/<id>.json` (`publisher.py`).
- **CVE-2025-7897** — MPT enlazado a `127.0.0.1` (local) o puerto publicado solo en loopback (Docker); config generada por `gen_mpt_config.py`.
- **Fallback manual** — bloqueos de IG (`ChallengeRequired`, etc.) → `adb push` del MP4 al teléfono + `logs/fallback_queue.json` con `awaiting_manual_upload`.
- **Logs** — rotación diaria (`logs/YYYY-MM-DD/platform.log` vía TimedRotatingFileHandler), contraseñas/tokens nunca en claro (enmascarados en `proxy_manager`).
- **CORS** — solo orígenes loopback (`ALLOWED_ORIGINS`).

## Módulos

| Archivo | Responsabilidad |
|---|---|
| `platform.py` | Flask API + SSE + stats (psutil) + persistencia JSON |
| `proxy_manager.py` | `get_proxy_dict`, `configure_phone_proxy` (ADB), `verify_proxy` (ipify) |
| `generator.py` | `generate_reel` → API MoneyPrinterTurbo (`/videos`, `/tasks/{id}`, `/download`) |
| `publisher.py` | `publish_video` → instagrapi (sesión + device spoofing Galaxy A52) |
| `engagement.py` | `start_bot/stop_bot/get_bot_status` → taktik-bot (subprocesos + taskkill) |
| `platform_data.py` | Capa de persistencia JSON compartida (thread-safe) |
