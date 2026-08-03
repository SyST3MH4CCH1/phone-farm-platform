# Phone Farm Platform

**Phone Farm Control Center** — panel de control para granjas de teléfonos Android (ADB): gestión de cuentas de redes sociales, proxies SOCKS5, cola de generación de contenido con IA (MoneyPrinterTurbo + Gemini) y logs en vivo.

> ⚠️ **Estado:** el backend es un *mock funcional* — la publicación, el bridge ADB y el pipeline de vídeo están simulados para desarrollo. Ver [docs/AUDIT.md](docs/AUDIT.md) para el análisis completo y el roadmap de integración real.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind 4 (panel oscuro tipo terminal)
- **Backend:** Express 4 (TypeScript, ejecutado con tsx)
- **IA:** Google Gemini (`@google/genai`) para guiones virales
- **Agentes:** servidor **MCP** (Model Context Protocol) en `/mcp` — 15 tools para operar la granja desde agentes
- **Runtime:** Node 20+ / Bun 1.x

## Requisitos

- Node.js ≥ 20 (o Bun ≥ 1.1)

## Puesta en marcha

```bash
bun install          # o npm install
cp .env.example .env # ajusta ADMIN_PASSWORD / GEMINI_API_KEY
bun run dev          # http://localhost:3000
```

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

El servidor expone MCP sobre **Streamable HTTP** en `POST /mcp`. Requiere autenticación (cookie o `Authorization: Bearer`).

```bash
# Cliente MCP de ejemplo (TypeScript/Node):
new Client({ name: "mi-agente", version: "1.0.0" })
  .connect(new StreamableHTTPClientTransport({
    url: "http://127.0.0.1:3000/mcp",
    authProvider: { getToken: async () => ({ scheme: "bearer", credentials: "<token>" }) }
  }));
```

**Tools disponibles:** `get_stats`, `list_accounts`, `create_account`, `delete_account`, `start_bot`, `stop_bot`, `list_proxies`, `verify_proxy`, `list_queue`, `create_job`, `process_next_job`, `generate_video`, `get_moneyprinter_config`, `get_bridge_config`, `get_logs`.

Ejemplo de invocación (JSON-RPC):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "create_job", "arguments": { "keyword": "recetas faciles 5 minutos" } }
}
```

### Conectar agentes locales

- **ZCode / Claude / Codex / OpenCode:** registra `http://127.0.0.1:3000/mcp` como MCP server con header `Authorization: Bearer <token>`.
- **oh-my-codex / ponytail / headroom:** usa la herramienta `generate_video` o `create_job` como paso de un workflow (`$deep-interview`, `$team`, etc.).
- **opencode-kilo-auth:** el gateway Kilo no es necesario para operar la farm; la farm es la *herramienta*, no el *modelo*.

## Scripts

```bash
bun run dev        # desarrollo (Vite HMR + API + MCP)
bun run build      # build de producción (frontend + server.cjs)
bun run start      # ejecuta el build de producción
bun run typecheck  # tsc --noEmit (también es el "lint")
```

## Seguridad

- Credenciales por entorno (nunca en código) — `docs/AUDIT.md §2.1`
- Sesión con cookie `httpOnly` + `SameSite=Strict`; tokens validados en toda la API — `§2.3`
- Sin bypass de autenticación ni en servidor ni en cliente — `§2.2, §2.4`
- API keys solo por entorno (`GEMINI_API_KEY`, `PEXELS_API_KEY`) — `§2.5`
- Secret scan (gitleaks) en CI

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
