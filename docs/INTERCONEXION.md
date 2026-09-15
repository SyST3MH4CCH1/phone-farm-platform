# Interconexión — Phone Farm Platform

**Fecha:** 9 agosto 2026 · **Propósito:** mapa único de cómo se conectan todos los componentes del sistema, qué proceso habla con cuál, por qué puerto y con qué autenticación.

> Documento vivo. Si añades un endpoint, un servicio o un puerto, actualízalo aquí.
>
> **Planes relacionados:** [`PLAN-LOCAL-VPS.md`](PLAN-LOCAL-VPS.md) (qué va en local vs VPS) · [`AUDIT.md`](AUDIT.md) (seguridad).

---

## 1. Arquitectura de un vistazo

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MINI PC (Windows)                                                       │
│                                                                          │
│  NAVEGADOR DEL OPERADOR                                                  │
│      │ http://127.0.0.1:3000  (cookie pf_session, HttpOnly)             │
│      ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  server.ts  —  Express + Vite   (puerto 3000)                     │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │ UI React 19 (src/)  ── SPA servida por Vite middleware    │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │  Autenticación usuario: sesiones multi-usuario en memoria      │   │
│  │  (sha256(token) → SessionUser)  ·  RBAC admin/operator         │   │
│  │  Reenvía /api/*, /engagement/*, /videos/* a Flask con            │   │
│  │  header X-Internal-Auth: <PHONE_FARM_INTERNAL_TOKEN>            │   │
│  └───────────────────────┬─────────────────────────────────────────┘   │
│                          │ loopback HTTP                                 │
│                          ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  platform.py  —  Flask   (puerto 5000)                            │   │
│  │  @before_request auth_internal  → exige X-Internal-Auth          │   │
│  │  CORS solo loopback                                              │   │
│  │  ┌─────────────┬──────────────┬───────────────┬──────────────┐  │   │
│  │  │ platform_data│ content     │ generator      │ publisher    │  │   │
│  │  │ (JSON store) │ (LLM)       │ (MPT client)   │ (instagrapi) │  │   │
│  │  ├─────────────┼──────────────┼───────────────┼──────────────┤  │   │
│  │  │ engagement  │ proxy_manager│ mcp_server     │ scheduler    │  │   │
│  │  │ (taktik)    │ (adb)        │ (FastMCP)      │ (30s thread) │  │   │
│  │  └─────────────┴──────────────┴───────────────┴──────────────┘  │   │
│  │  Persistencia: platform/{accounts,proxies,queue,content_profiles}│   │
│  │  .json  +  logs/  +  sessions/  +  videos/                      │   │
│  └───────┬───────────────────┬───────────────────┬───────────────┘   │
│          │                   │                   │                    │
│          │ HTTP :8080        │ HTTP :5001        │ subprocess         │
│          ▼                   ▼                   ▼                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │ MoneyPrinter │   │ MCP server    │   │ Procesos externos:        │  │
│  │ Turbo (MPT)  │   │ (uvicorn,     │   │  · adb daemon  :5037      │  │
│  │ FastAPI      │   │  /mcp, loopbk)│   │  · taktik-bot (Popen)     │  │
│  │ :8080        │   │  15 tools     │   │  · ffmpeg / ffprobe       │  │
│  │ solo loopback│   │               │   │  · edge-tts (TTS voz)     │  │
│  └──────────────┘   └──────────────┘   └──────────────────────────┘  │
│                                                                          │
│  Teléfonos físicos ──USB/WiFi──▶ adb daemon ──▶ platform.py (adb shell/push)
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Puertos y protocolos

| Puerto | Proceso | Protocolo | Bind | Auth | Quién lo usa |
|---|---|---|---|---|---|
| **3000** | Express (`tsx server.ts`) | HTTP | `0.0.0.0` | cookie `pf_session` + RBAC | Operador (navegador) · **`/panda`** |
| **5000** | Flask (`python -m phonefarm.platform`) | HTTP | `127.0.0.1` | `X-Internal-Auth` token | Express (proxy), MCP |
| **5001** | MCP (`mcp_server.py` vía uvicorn) | HTTP/JSON-RPC | `127.0.0.1` | sin auth (loopback) | Agentes IA (ZCode, Claude) |
| **8080** | MoneyPrinterTurbo | HTTP/FastAPI | `127.0.0.1` | ninguna (loopback, CVE-2025-7897) | `generator.py` |
| **5037** | ADB daemon | TCP | `127.0.0.1` | claves adbkey (host) | `proxy_manager.py`, `engagement.py`, **`/api/adb/screenshot`** |

**Regla de oro:** solo el puerto **3000** debe estar expuesto a la red (`0.0.0.0`). Todo lo demás es **loopback** (`127.0.0.1`). Si necesitas acceso externo a Flask, pon un reverse-proxy delante o abre el puerto con firewall — nunca quites el `X-Internal-Auth`.

---

## 3. Flujo de una petición (end-to-end)

Ejemplo: el operador pulsa **"Generar reel"** en la UI.

```
React (MoneyPrinterModal)
  │ POST /api/moneyprinter/generate  (cookie pf_session)
  ▼
Express server.ts
  │ requireAuth → OK  →  proxy flask("POST","/api/queue",{auto_approve:true})
  │ header: X-Internal-Auth: <token interno>
  ▼
Flask platform.py
  │ @before_request auth_internal → token OK
  │ api_queue_create(): lee accounts.json, proxies.json, content_profiles.json
  │ escribe queue.json (job nuevo, status=pending)
  │ thread _script_job:
  │   content.build_script() → HTTPS a LLM (MiniMax/OpenAI/Kimi)
  │   auto_approve → generator:
  │     POST http://127.0.0.1:8080/api/v1/videos   (MPT)
  │     poll GET /api/v1/tasks/<id>  (hasta 3600 s)
  │     descarga MP4 → platform/videos/<job>.mp4
  │   status → awaiting_preview
  ▼
Operador ve el vídeo en PostPreviewModal (GET /videos/<file> servido por Express)
  │ POST /api/queue/<id>/publish
  ▼
Flask publisher.py
  │ instagrapi clip_upload → HTTPS a Instagram (con proxy SOCKS5 de la cuenta)
  │ fallback: adb push <mp4> /sdcard/Download/ → logs/fallback_queue.json
  │ status → published / awaiting_manual_upload
```

---

## 4. Autenticación en tres capas

| Capa | Quién es el "usuario" | Mecanismo | Dónde se valida |
|---|---|---|---|
| **1. Operador → Express** | Humano con navegador | Cookie `pf_session` (HttpOnly, SameSite=Strict) + sesión en memoria | `requireAuth` en `server.ts` |
| **2. Express → Flask** | Servicio interno | Header `X-Internal-Auth: <PHONE_FARM_INTERNAL_TOKEN>` | `auth_internal` en `platform.py` |
| **3. Agente → MCP** | IA externa (loopback) | Ninguna (confía en loopback) | `mcp_server.py` (sin auth, solo :5001) |

### RBAC (control de acceso por rol)

| Rol | Puede hacer |
|---|---|
| `admin` | Todo: crear/borrar cuentas, proxies, borrar jobs, descargar ZIP, ver código fuente, guardar config MPT |
| `operator` | Solo lectura + operación: ver stats, cuentas, proxies, cola, aprobar/rechazar/publicar/reprogramar jobs, iniciar/parar bots |

Endpoints **solo admin** (`requireRole("admin")`): `POST/DELETE /api/accounts`, `POST/DELETE /api/proxies`, `DELETE /api/queue/:id`, `GET /api/download-zip`, `GET /api/source*`, `POST /api/moneyprinter/config`.

---

## 5. Ficheros de datos y quién los toca

| Archivo | Dueño de escritura | Lectores | Notas |
|---|---|---|---|
| `platform/accounts.json` | `platform.py` | todos los módulos | cifrado at-rest AES-256-GCM (enc_password, ver docs/AUDIT.md Ronda 2 paso 4) |
| `platform/proxies.json` | `platform.py` | `publisher`, `engagement` | nunca expone `pass` por API |
| `platform/queue.json` | `platform.py` | Express (ZIP), MCP | pipeline 3-etapas |
| `platform/content_profiles.json` | `platform.py` | `content.py` | nichos + voces |
| `platform/logs/fallback_queue.json` | `publisher.py` | operador | subidas manuales pendientes |
| `platform/logs/workflows/<id>.json` | `engagement.py` | `taktik` | config de bot por cuenta |
| `platform/sessions/<id>.json` | `publisher.py` | `instagrapi` | cookies IG (¡sensible!) |
| `platform/videos/*.mp4` | `generator.py` | Express (`/videos/:file`) | servido solo con sesión |

**Canónico vs duplicado:** en ejecución **nativa** el directorio activo es `platform/` (porque `.env` fija `PHONE_FARM_DATA_DIR`). El subdirectorio `platform/data/` solo se usa en el despliegue **Docker** y contiene semillas obsoletas de la corrida del 3 ago 2026. No edites `platform/data/` a mano esperando que afecte al sistema nativo.

---

## 6. Variables de entorno (fuente única de verdad)

### Raíz `.env` (leído por `server.ts` y `docker-compose`)
```
ADMIN_USERNAME / ADMIN_PASSWORD       # login operador admin (obligatorio en prod)
OPERATOR_USERNAME / OPERATOR_PASSWORD # login operador (obligatorio en prod)
PHONE_FARM_INTERNAL_TOKEN             # token Express↔Flask (debe coincidir con INTERNAL_TOKEN de platform/.env)
FLASK_BASE                            # default http://127.0.0.1:5000
PEXELS_API_KEY / MINIMAX_API_KEY      # claves de terceros (MPT, generación)
EXPOSE_SOURCE                         # "true" para habilitar /api/source (default off)
```

### `platform/.env` (leído por los módulos Python vía `platform_data.py`)
```
INTERNAL_TOKEN                # mismo valor que PHONE_FARM_INTERNAL_TOKEN de la raíz
PHONE_FARM_DATA_DIR           # default: directorio platform/ (nativo)
MPT_API_URL                   # default http://127.0.0.1:8080
PEXELS_API_KEY, MINIMAX_API_KEY, MINIMAX_BASE_URL, MINIMAX_MODEL
ADB_HOST, ADB_PORT            # default 127.0.0.1:5037
```

> ⚠️ **Rotación pendiente:** `MINIMAX_API_KEY` y `PEXELS_API_KEY` estuvieron en disco en claro y en `mpt-config.toml`. Rota ambas claves en sus paneles de proveedor y actualiza los `.env`.

---

## 7. Procesos externos lanzados por el backend

| Proceso | Lanzado desde | Comando / llamada | Timeout |
|---|---|---|---|
| MoneyPrinterTurbo | `generator.py` | HTTP `:8080/api/v1/videos` + poll | 3600 s global |
| taktik-bot | `engagement.py` | `python -m taktik automation workflow …` (Popen) | largo, sin timeout (monitorizado) |
| adb devices / shell / push | `proxy_manager.py`, `publisher.py` | `adb [-H host -P port] …` | 6–120 s |
| **scrcpy (mirror)** | `server.ts` `POST /api/adb/mirror` | `scrcpy -s <serial>` (ventana nativa) | desacoplado |
| **screenshot PNG** | `server.ts` `GET /api/adb/screenshot/:serial` | `adb -s <serial> exec-out screencap -p` (Buffer) | 8 s · cache 900 ms |
| ffprobe / ffmpeg | `generator.py` | validar MP4, demo mode | 30–120 s |
| edge-tts | `server.ts` (`/api/moneyprinter/voices`) | `edge-tts --list-voices` | 8 s |
| LLM (MiniMax/OpenAI/Kimi) | `content.py` | HTTPS `…/v1/chat/completions` | 60 s |
| ipify (check proxy) | `proxy_manager.py` | HTTPS `api.ipify.org` vía SOCKS5 | 8 s |

---

## 8. Puntos de interconexión conocidos (y su estado)

| Conexión | Estado | Notas |
|---|---|---|
| UI ↔ Express `/api/auth/*` | ✅ | login multi-sesión, RBAC |
| Express ↔ Flask `/api/*` | ✅ | proxy genérico con `X-Internal-Auth` |
| Express ↔ Flask `/engagement/*` | ✅ (ahora con auth) | antes era vía abierta sin sesión |
| Express ↔ Flask `/stream/logs` (SSE) | ✅ | streaming crudo |
| Express ↔ MPT `:8080` | ✅ | healthcheck `/openapi.json` |
| Flask ↔ MPT `:8080` | ✅ | `generator.py` |
| Flask ↔ Instagram (instagrapi) | ✅ | con fallback ADB push |
| Flask ↔ adb daemon `:5037` | ✅ | descubrimiento y push |
| Agentes ↔ MCP `:5001` | ✅ | 15 tools, loopback |
| **Panel ↔ scrcpy** (`POST /api/adb/mirror`) | ✅ | botón en tarjeta → abre ventana scrcpy |
| **Panda `/panda`** (`/api/adb/screenshot/:serial`) | ✅ (nuevo) | grid de pantallas live por screencap PNG, abrible en otra ventana |
| `POST /api/moneyprinter/config` | ✅ (reparado) | antes 404; ahora persiste en `.env` |
| CodeViewer ↔ `/api/source` | ✅ (reparado) | antes leía objeto vacío; ahora fetch real |
| `farm-engine.ts` / `mcp.ts` | ❌ legacy | candidatos a borrado (ver AUDIT) |

---

## 9. Qué NO está conectado (deuda técnica)

1. **`farm-engine.ts` y `mcp.ts`** (raíz): engine mock y MCP TS no referenciados. El MCP real es el Python (`:5001`). *Acción:* borrarlos o etiquetarlos como `legacy/`.
2. **Endpoints sin consumidor UI — verificados como API-only internos:**

   | Endpoint | Gate | Consumidor | Notas |
   |---|---|---|---|
   | `GET /api/moneyprinter/voices` | `requireRole("admin")` | NO — API-only | Lista voces edge-tts. admin-only. Testado en `test/rbac.test.ts`. |
   | `GET /api/adb/config` | `requireAuth` (global `/api/*`) | NO — API-only | Bridge config. Session auth (cookie). Sin UI pero funcional para curl/MCP. |
   | `GET /api/logs` | `requireAuth` (global `/api/*`) | NO — API-only | Proxy stats. Logs live van por `/api/stream/logs` (SSE, usado por UI). Este endpoint es estático. |

   *Decisión: mantener — útiles para curl/MCP/agentes. No erosiona la seguridad (gate correcto).*
3. **`platform/data/*.json`**: semillas Docker obsoletas; riesgo de confusión. *Acción:* documentar que es solo-Docker o regenerar.
4. **Sesiones IG**: `accounts.json` referencia `sessions/acc_XX.json` que no existen → los jobs caen a `awaiting_manual_upload`. *Acción:* hacer `POST /api/accounts/:id/instagram/login` por cuenta.
5. **Cifrado en reposo**: `accounts.json` guarda contraseñas IG en claro. *Acción:* cifrar con `age`/Fernet antes de producción.

---

*Fin. Para el análisis de riesgos ver `docs/AUDIT.md`; para operación diaria ver `MANUAL.md`.*
