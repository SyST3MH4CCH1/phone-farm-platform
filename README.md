# Phone Farm Platform

**Phone Farm Control Center** — panel de control para granjas de teléfonos Android (ADB): gestión de cuentas de redes sociales, proxies SOCKS5, cola de generación de contenido con IA (MoneyPrinterTurbo + Gemini) y logs en vivo.

> ⚠️ **Estado:** integración **real** (sin mocks). El backend Flask (`platform/`) es la fuente de verdad; este panel React es la interfaz de operación. Ver [docs/AUDIT.md](docs/AUDIT.md) para seguridad y [docs/INTERCONEXION.md](docs/INTERCONEXION.md) para el mapa completo de cómo se conectan todos los procesos.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind 4 (panel oscuro tipo terminal)
- **Backend panel:** Express 4 (TypeScript, ejecutado con tsx) — sirve la SPA y hace proxy a Flask
- **Backend real:** Python Flask (`platform/`) — orquesta cuentas, proxies, cola, MPT, instagrapi, taktik
- **IA:** LLM vía MiniMax/OpenAI/Kimi para guiones (configurable con `LLM_PROVIDER`)
- **Agentes:** servidor **MCP** en `platform/phonefarm/mcp_server.py` (`http://127.0.0.1:5001/mcp`) — 15 tools
- **Runtime:** Node 20+ / Bun 1.x · Python 3.12

## Documentación

| Documento | Qué cubre |
|---|---|
| **[docs/INTERCONEXION.md](docs/INTERCONEXION.md)** | 🔗 Mapa de procesos, puertos, auth por capa y flujo end-to-end |
| **[docs/MIGRACION-GPU.md](docs/MIGRACION-GPU.md)** | 🚀 Runbook para migrar a máquina con GPU dedicada + RAM (instalación, datos, NVENC) |
| [docs/PLAN-LOCAL-VPS.md](docs/PLAN-LOCAL-VPS.md) | División Local vs VPS (3 arquitecturas + checklist) |
| [docs/CAMBIOS-DASHBOARD.md](docs/CAMBIOS-DASHBOARD.md) | Registro de cambios del dashboard (qué/cuándo) |
| [MANUAL.md](MANUAL.md) | Operación diaria: pipeline, calendario, problemas conocidos |
| [docs/AUDIT.md](docs/AUDIT.md) | Auditoría de seguridad y estado de remediación |
| [platform/README.md](platform/README.md) | Backend Python, Docker y despliegue |

## Requisitos

- Node.js ≥ 20 (o Bun ≥ 1.1)

## Puesta en marcha

```bash
bun install          # o npm install
cp .env.example .env # rellena ADMIN_PASSWORD, PHONE_FARM_INTERNAL_TOKEN, claves
bun run dev          # http://localhost:3000
```

> También necesitas el backend Python: `cd platform && python -m phonefarm.platform` (ver [platform/README.md](platform/README.md)).

**Credenciales de demo (solo dev):** `admin/admin123` (admin) · `operator/operator123` (operator).

> En producción (`NODE_ENV=production`) es **obligatorio** definir `ADMIN_PASSWORD` y `OPERATOR_PASSWORD`; el servidor se niega a arrancar sin ellas.

## API REST

Toda la API (`/api/*`) exige sesión: cookie `httpOnly` `pf_session` o `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Inicia sesión (rate limit: 10 intentos / 15 min) |
| POST | `/api/auth/logout` | Cierra sesión |
| GET | `/api/auth/me` | Estado de la sesión |
| GET | `/api/stats` | Métricas del sistema |
| GET/POST/DELETE | `/api/accounts` | Gestión de cuentas (sin exponer contraseñas) |
| GET/POST | `/api/proxies` · POST `/api/proxies/verify` | Gestión y verificación de proxies |
| GET/POST | `/api/queue` · POST `/api/queue/next` | Cola de contenido + procesamiento con Gemini |
| GET/POST | `/api/moneyprinter/*` | Configuración y pipeline MoneyPrinterTurbo |
| GET/POST | `/api/adb/*` | Bridge ADB / Mini PC Flask |
| GET | `/api/logs` · `/api/stream/logs` (SSE) | Logs del sistema en vivo |
| GET | `/api/download-zip` | Exporta config en ZIP |

## MCP Server (agentes)

El **MCP real** vive en el backend Python: `platform/phonefarm/mcp_server.py` expone Streamable HTTP en **`http://127.0.0.1:5001/mcp`** (loopback, sin auth — confía en que solo procesos locales del host lo llaman).

```bash
# Cliente MCP de ejemplo (TypeScript/Node):
new Client({ name: "mi-agente", version: "1.0.0" })
  .connect(new StreamableHTTPClientTransport({
    url: "http://127.0.0.1:5001/mcp"
  }));
```

**15 tools:** `create_content_job`, `list_jobs`, `get_drafts`, `approve_job`, `publish_job`, `reject_job`, `generate_script_preview`, `list_content_profiles`, `create_content_profile`, `get_stats`, `list_accounts`, `start_bot`, `stop_bot`, `list_proxies`, `get_logs`.

> Nota: el antiguo `mcp.ts`/`farm-engine.ts` (raíz) eran código muerto del template original y fueron eliminados el 2026-08-09.

## Scripts

```bash
bun run dev        # desarrollo (Vite HMR + API + MCP)
bun run build      # build de producción (frontend + server.cjs)
bun run start      # ejecuta el build de producción
bun run typecheck  # tsc --noEmit (también es el "lint")
```

## Seguridad

- Sesiones **multi-usuario** en memoria con expiración + RBAC `admin`/`operator` (AUDIT-001/002/008)
- Comparación de credenciales **timing-safe**; token solo en cookie, nunca en el body (AUDIT-006/007)
- Proxy Express→Flask con `X-Internal-Auth` desde entorno (sin fallback embebido)
- `/engagement/*` y `/videos/*` protegidos por sesión (antes eran vía abierta)
- `/api/source` y `/api/download-zip` solo `admin`; download-zip redacta seriales/hosts
- `.env` no trackeado; claves ADB y dumps de UI fuera del repo

## Auditoría

Informe completo de la auditoría (hallazgos + remediación + roadmap): **[docs/AUDIT.md](docs/AUDIT.md)**

## Backend real (Python + Docker) — `platform/`

Este panel React es la interfaz avanzada; el **backend real** de la granja vive en [`platform/`](platform/README.md):

- **Flask API** (`platform.py`) — 11 endpoints + SSE + stats reales (psutil) + persistencia JSON
- **MoneyPrinterTurbo** (`generator.py`) — generación real de Reels 9:16 (API FastAPI, solo loopback — CVE-2025-7897)
- **instagrapi** (`publisher.py`) — publicación con sesión persistente + device spoofing Galaxy A52
- **taktik-bot** (`engagement.py`) — engagement con límites de warmup y aislamiento 1:1
- **Docker** — `docker compose` levanta platform + moneyprinter; despliegue con `platform/scripts/deploy.ps1` → `C:\phone-farm\`

```powershell
powershell -ExecutionPolicy Bypass -File platform\scripts\deploy.ps1
```
