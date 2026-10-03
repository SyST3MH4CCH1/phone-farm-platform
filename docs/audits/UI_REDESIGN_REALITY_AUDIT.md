# UI Redesign Reality Audit — Control Hub / Phone Farm

**Fecha:** 2026-10-03
**Versión:** 1.0
**Auditor:** MiniMax M3 + agente de rediseño UI
**Fuentes:** lectura directa del repositorio en `chore/update-third-party @ b6995e5` antes de aplicar el TASK_UI_UX_REAL_CONTROL_HUB_V1.
**Método:** inspección de `package.json`, `server.ts`, `server/app.ts`, `src/**/*.tsx`, `src/types.ts`, `src/index.css`, `platform/**/*.py`, `platform/third_party/MoneyPrinterTurbo/**`. Se cruza con `docs/INTERCONEXION.md`, `docs/AUDIT.md`, `docs/CAMBIOS-DASHBOARD.md` y los tests existentes.

---

## 0. Reglas del audit (TASK §2)

- `REAL`: existe y funciona, con fuente de datos verificable.
- `PARCIAL`: existe la ruta/componente, pero el dato no está conectado end-to-end (estado intermedio, degradado, conditional).
- `MOCK`: el componente se renderiza con datos literales hardcoded o calculados artificialmente.
- `NO IMPLEMENTADA`: la ruta existe en el sidebar/header pero la pantalla solo tiene esqueleto / está vacía.
- `RIESGOSA`: el componente expone superficie peligrosa (RCE, SSRF, secrets, etc.) y debe endurecerse antes de "declararla funcional".

---

## 1. Inventario técnico (TASK §2.1)

### 1.1 Stack encontrado

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Frontend | React + Vite + Tailwind 4 | React 19.3, Vite 6.4.3, Tailwind 4.1.14 | Modo SPA, dev server en :3000 con Vite middleware; prod build a `dist/`. |
| Componentes UI | Componentes propios + lucide-react + motion | lucide 0.546, motion 12.23 | Sin librería de design-system externa (Radix/Shadcn/Blueprint). |
| Charts | SVG inline (Sparkline / RingProgress) | propios | NO Recharts. NO Chart.js. |
| Backend panel | Express + TypeScript + Helmet | Express 4.22, helmet 8.3, esbuild | Sirve SPA y hace de proxy autenticado a Flask :5000. |
| Backend real | Python Flask (instagrapi/taktik/MoneyPrinterTurbo) | Python 3.12 | Persistencia en JSON (`platform/data/*.json`). |
| DB panel | SQLite (better-sqlite3) | better-sqlite3 13.0 | Compartida con Flask (users/sessions/rate_limits). |
| MCP server | Streamable HTTP en :5001 | Python `platform/phonefarm/mcp_server.py` | 15 tools. Solo loopback, sin auth (confía en host-local). |
| ADB | adbutils / adb shell | adbutils 2.12 | Llamadas allowlisted (touch, screenshot, mirror). |
| MoneyPrinterTurbo | FastAPI upstream (`harry0703/MoneyPrinterTurbo`) | pin `cf5a3aedad1741d012152d355aa909d224fc4557` v1.3.7 MIT | Ejecutado en :8080 desde `.venv-mpt` integrado en el repo. |
| Scheduler / cola | Cola JSON persistida | — | `platform/data/queue.json`. |
| SSE / WebSocket | SSE en `/api/stream/logs` (Express→Flask) | — | Sin WS dedicado (realtime usa SSE + polling). |
| Logs | SSE + buffer interno `MAX_LOG_LINES = 64 KiB` | — | Limpia solo el view (no el log persistido en disco). |
| Tests | vitest (Node) + pytest (Python) | vitest 4.1.10, pytest actual | 76 vitest + 64 pytest OK en este commit. |
| Build | esbuild para `server.cjs`, Vite para SPA | esbuild 0.25 | Output: `dist/server.cjs` + `dist/assets/index-*.js` (857 kB). |
| Lockfiles | `bun.lock` + `package-lock.json` | ambos en repo | Bun canónico en dev; npm como alternativa (workflows separados). |
| Iconos | lucide-react 0.546 | — | Set unificado. |
| Theming | CSS vars Tailwind 4 (`@theme` block) + `@layer utilities` | — | Ya oscuro only (`.theme-dark`); tokens declarados en `src/index.css`. |
| Variables de entorno | dotenv 17.2 | — | Una sola fuente: `.env` raíz (no committeado, `.gitignore`). |
| Feature flags | Solo `nodeEnv`, `cookieSecure`, `internalToken` | — | No hay flags declarados todavía (el TASK pide crear `ENABLE_DEV_CODE_EDITOR`, etc.). |

### 1.2 Rutas/pantallas actuales del frontend

| Pestaña / Sidebar | Componente | Estado |
|---|---|---|
| Dashboard | `DashboardView` (en `src/App.tsx`) | Renderiza 5 stat cards + 4 cards infraestructura + Cuentas/Cola/Calendario. |
| Cuentas | `AccountsPanel` | CRUD real conectado a `/api/accounts`. |
| Cola | `QueuePanel` | CRUD real conectado a `/api/queue*`. |
| Calendario | `ScheduleModal` (con prop `embedded`) | react-big-calendar dark, API REST real. |
| MoneyPrinter | `MoneyPrinterModal` | Config + submit a MPT real (proxy a Flask). |
| ADB Bridge | `AdbBridgeModal` | Diagnóstico ADB sobre `/api/adb/*`. |
| Panda Live | `PandaGridModal` | Ver `src/components/PandaGridModal.tsx` (real ADB mirror / screenshot). |
| cURL API | `CurlTesterModal` | Probador REST contra el propio panel. |
| Python Code | `CodeViewerModal` | Solo LECTURA de archivos del backend Python (no RCE en producción; sí lo permite en dev según implementación actual). |
| Versiones | `VersionControlModal` | Stack info + versiones semánticas. |
| Proxies | `ProxyModal` | CRUD + verify contra `/api/proxies`. |

### 1.3 Sistema de estilos

- Tailwind 4 con bloque `@theme` (no config en `tailwind.config.js`).
- CSS vars: `--color-canvas`, `--color-surface{1..4}`, `--color-line`, `--color-brand (#00FF88 Matrix Green)`, `--color-ok/warn/danger/info`, `--color-text/muted/muted-2`, `--color-input-bg/border`.
- `@layer utilities`: `.btn-brand/.btn-primary/.btn-secondary/.btn-ghost/.btn-danger/.btn-icon/.btn-close`, `.card/.card-hover`, `.input`, `.modal-overlay/.modal-shell/.modal-header`, `.state-ok/warn/err`, `.status-pill{.ok/.warn/.danger/.info}` con `@keyframes pulse-*`, `.sparkline`, `.progress-bar`.
- Typography: `font-mono` = `'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace`. Sin sans system explícito (asume el default del browser).
- Dark-only (no `.theme-light` activo). El body root es ya `#0A0A0B`.
- **Regresión CSS detectada:** `@media (prefers-reduced-motion: reduce)` usa sintaxis que enumera keyframes con comas (`@keyframes pulse-ok, @keyframes pulse-warn, @keyframes pulse-danger { animation: none; }`) — **CSS no permite esto**. El bloque es IGNORADO por Vite (warning visible en `bun run build`). Aceptado como preexistente y se reescribe en este redesign.

### 1.4 Icon library

- `lucide-react@0.546` (Sparkles, Smartphone, Terminal, Code2, GitBranch, Download, LogOut, Power, etc.). Coherente y activo en producción.

### 1.5 Chart library

- **NO** Recharts. **NO** Chart.js.
- Implementación propia: `RingProgress` (SVG donut) y `MiniBar` (barra) en `App.tsx`. Sparkline (`<svg>` path inline) reservado en `src/index.css`.

### 1.6 Persistencia

- **Panel**: SQLite (`./data/pf.db` por defecto) — users, sessions, rate_limits.
- **Backend Flask**: JSON files en `platform/data/` — `accounts.json`, `proxies.json`, `queue.json`, `drafts.json`, `stats.json`, `audit.jsonl`.
- **MoneyPrinterTurbo**: SQLite `platform/third_party/MoneyPrinterTurbo/storage/`.

### 1.7 Job/cola system

- Estados reales: `pending | scripting | awaiting_approval | generating | awaiting_preview | ready_for_publish | publishing | published | failed | rejected | awaiting_manual_upload`.
- Ver `src/types.ts:66-80` (`QueueJob.status`). **Existe más granularidad** que el pipeline canónico del mockup (`Queued → Generating → Ready → Publishing → Completed`), por lo que el pipeline visual se construye con esos 5 buckets agregando los 11 estados (mapeo documentado en §6).

### 1.8 SSE / WebSocket / polling

- SSE: `/api/stream/logs` (Flask → Express → navegador). `src/components/TerminalLogs.tsx` lo consume via `EventSource`.
- Polling: `refreshBackendData()` cada 10 s en `App.tsx` (stats, accounts, queue, proxies, devices).
- WebSocket: **NO** existe.

### 1.9 ADB / device integration

- `adbutils` 2.12 — Python.
- Acciones allowlisted en backend: `health`, `list_devices`, `screenshot`, `mirror` (scrcpy), `touch` (con validación de coordenadas), `battery`, `version`, `network_info`.
- Prohibido por TASK §14: shell arbitrario. El backend actual **no expone** `adb shell <input>`, lo que cumple.

### 1.10 MoneyPrinterTurbo

- Pinned: `cf5a3aedad1741d012152d355aa909d224fc4557` (v1.3.7, MIT).
- License hash: derivado de `LICENSE` (MIT, copyright 2024 Harry). Texto confirmado.
- Endpoints integrados vía `/api/moneyprinter/*` proxy a Flask.
- Capability gate ya implementado para publishing cross-post (NO habilitado en producción).

### 1.11 Proxies

- Sí existe. CRUD real en `/api/proxies`. Verificación via `/api/proxies/verify` (latency_ms real medida).
- Sin mapa mundial con ubicaciones ficticias — ya correcto.

### 1.12 Scheduler / calendario

- react-big-calendar con tema oscuro propio (`.rbc-dark`). Vista mes / semana / día / agenda.
- API: `/api/queue` con `scheduled_ts`.

### 1.13 Cuentas / social accounts

- `platform/phonefarm/publisher.py` usa `instagrapi` con sesión persistente + device spoofing Galaxy A52.
- 4 bridges en `taktik-bot`: instagram, tiktok, threads, youtube. Solo loopback.

### 1.14 Versiones / build info

- `VersionControlModal` lee `package.json` + `git rev-parse` + versiones del stack vía `/api/stack`.

### 1.15 cURL API / API explorer

- `CurlTesterModal`: ejecuta métodos/paths contra el propio panel. **No** deriva de `openapi.json` todavía — endpoints hardcoded (lista curada). Pendiente de generar desde FastAPI/Flask en Fase G.

### 1.16 Python execution

- `CodeViewerModal`: actualmente **READ-ONLY** (muestra archivos del backend). Ver §17 de TASK.

### 1.17 Tests

- Vitest (Node): `test/{smoke,secure-boot,readyz,db,passwords,dashboard-view,net,rbac}.test.ts` → 76/76 OK.
- pytest (Python): `platform/tests/` → 64/64 OK.
- Sin E2E (Playwright). Sin visual regression (Chromatic/Percy).

### 1.18 Docker / servicios locales

- `platform/scripts/deploy.ps1` levanta `docker compose` (`platform + moneyprinter`). Modo nativo (`platform/scripts/run-native.ps1`) usa `Get-NetTCPConnection` para detectar puertos.
- Tres servicios: platform :5000, MCP :5001, MPT :8080.

### 1.19 Variables de entorno (sin secretos)

- `PANEL_PORT`, `PANEL_HOST`, `FLASK_BASE`, `MPT_API_URL`, `INTERNAL_TOKEN`, `PUBLIC_BASE_URL`, `COOKIE_SECURE`, `NODE_ENV`.
- Backend Python: `MINIMAX_API_KEY`, `PEXELS_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `TIKTOK_SESSIONID`, `INSTAGRAM_USERNAME`, etc. → **NO** se exponen al bundle.

---

## 3. Matriz REAL / PARCIAL / MOCK / NO IMPLEMENTADA / RIESGOSA (TASK §2.2)

| Área | UI actual | Backend real | Fuente de datos | Estado | Riesgo | Acción |
|---|---|---|---|---|---|---|
| Dashboard (5 stat cards superiores) | `DashboardView` con stat cards | Flask `/api/stats` (psutil + counters reales) | `platform/phonefarm/platform.py: stats()` | **MIXTO**: la mayoría son REAL (devices, jobs, alertas, successRate). Hay **3 hardcoded fakes** (ver §4). | Bajo si se corrigen los fakes. | **Fase C**: eliminar `+12% vs ayer`, `onlineCount + 4`, `deviceCount \|\| 4`, sustituir `deviceCount + 4` por `accounts.length` o `—`. |
| Dashboard (4 cards infraestructura: stats, CPU/RAM/Disk, Devices, Proxies) | 4 cards | `/api/stats` + `/api/adb/devices` + `/api/proxies` | psutil (CPU/RAM/disk si existe); ADB list; `proxy_manager` | **REAL** para CPU/RAM. Disk = `—` si no llega dato (correcto). Devices = `deviceCount`. Proxies = lista real con `—` para proxies sin `latency_ms`. | Ninguno reseñable. | Refactor tipográfico Fase B (tabular-nums ya aplicado). |
| Cuentas | `AccountsPanel` | `/api/accounts` proxy a Flask | `accounts.json` | **REAL** CRUD. | Default `newSerial` se genera con `Math.random()` → "RFCW80XXXXX" — placeholder **NO** guardado hasta submit. **No es fake persistente**, pero la TASK pide no simular. | Reemplazar placeholder con `''` vacío. |
| Cola | `QueuePanel` | `/api/queue` + `/api/queue/{id}/{action}` | `queue.json` | **REAL**. 11 estados cubiertos. | `publishedToday` cuenta `status==='published'` sin filtro temporal. No es fake, pero **NO** está limitado a hoy (cuenta histórico). | Documentar en METRICS_CATALOG.md que la métrica es "total publicados" y crear la variante `published_today` cuando haya fuente temporal. |
| Calendario | `ScheduleModal` (rbc-dark) | `/api/queue` con `scheduled_ts` | `queue.json` | **REAL**. | Sin heatmap histórica (no aplica en dashboard, solo calendario completo — correcto). | Nada que cambiar para esta entrega. |
| MoneyPrinter | `MoneyPrinterModal` | `/api/moneyprinter/*` | MPT v1.3.7 + LLM (`minimax/llm_model`) | **REAL** con adapter: el panel nunca habla con MPT directamente; Flask lo orquesta. | HTTP `/api/moneyprinter/config` rechaza secretos (test rbac ya cubre). | MONEYPRINTERTURBO_ADAPTER.md en Fase E. |
| ADB Bridge | `AdbBridgeModal` | `/api/adb/*` | adbutils | **REAL** con allowlist. | Sin shell arbitrario (cumple TASK §14). | Confirmar allowlist en §14. |
| Panda Live | `PandaGridModal` | `/api/adb/mirror` (scrcpy) + `/api/adb/screenshot` | adbutils + scrcpy.exe | **PARCIAL**: la API devuelve mirror MJPEG cuando scrcpy está disponible; si no, screenshot estática. La UI **NO** debe fingir "live" cuando es snapshot. | Bajo. Revisar etiqueta "En vivo" — actualmente muestra "Snapshot" cuando no hay scrcpy (correcto). | Documentar. |
| cURL API | `CurlTesterModal` | Ejecuta contra el propio panel | hardcoded (lista curada) | **PARCIAL**: funciona, pero la lista no se deriva de OpenAPI todavía. | Ninguno. | Fase G: regenerar lista desde `/openapi.json` del backend cuando exista. |
| Código Python | `CodeViewerModal` | Listado estático + read file | `platform/phonefarm/*.py` | **REAL read-only**. | En dev permite editar pero NO ejecutar. No hay RCE en producción. | Fase G: añadir `ENABLE_DEV_CODE_EDITOR` flag explícito. |
| Versiones | `VersionControlModal` | `/api/stack` + `git` | real | **REAL**. | Mensaje "Rollback" ya está condicionado a existencia de mecanismo (cumple). | Documentar pin MPT en Versiones. |
| Proxies | `ProxyModal` | `/api/proxies` + `/api/proxies/verify` | `proxies.json` + verificación real (latency_ms) | **REAL**. | Sin mapa mundial con ubicaciones ficticias (cumple). | Mantener. |
| Consola / logs | `TerminalLogs` | `/api/logs` + `/api/stream/logs` (SSE) | Flask logs | **REAL** SSE. | Buffer 64 KiB + limpieza solo vista. No loguea secretos (ver `rbac.test.ts:export sin password válido → 403`). | Mantener. |
| Topbar / status global | `Header` | mezcla de stats/proxies/bots/dispositivos | real para todo lo que muestra | **MIXTO**: `onlineProxies` cuenta `status === 'online'` (correcto), pero `botsActive = (stats.active_bots || 0) > 0` interpreta cualquier valor positivo como "ON". El switch master dispara `/api/botstart/toggle` o similar (ver `server/app.ts`). | Bajo. | Documentar source por celda. |

---

## 4. Regresiones fake detectadas (TASK §6, §9, §30 — NO se atribuyen al rediseño, se documentan y eliminan en Fase C)

### 4.1 `src/App.tsx:243`

```tsx
<StatCard
  title="Dispositivos"
  value={`${deviceCount} / ${deviceCount || 4}`}     // ❌ || 4 hardcoded
  subtitle="Online"
  ...
  bar={deviceCount > 0 ? Math.min(100, (deviceCount / Math.max(1, deviceCount)) * 100) : 100}
/>
```

- **Problema:** el denominador "4" se inventa cuando `deviceCount === 0`.
- **Solución Fase C:** `value={\`${deviceCount}\`}` y `subtitle="Online"`; cuando `deviceCount === 0`, mostrar `—` o `0 / 0`.

### 4.2 `src/App.tsx:252` y `:255`

```tsx
<StatCard
  title="Cuentas activas"
  value={`${activeCount}`}
  subtitle={`de ${activeCount + 4} totales`}            // ❌ +4 hardcoded
  ...
  bar={activeCount > 0 ? Math.min(100, Math.round((activeCount / (activeCount + 4)) * 100)) : 0}
/>
```

- **Problema:** "+4" simula cuentas totales cuando no se sabe cuántas hay. Viola TASK §0, §6 y §30.
- **Solución Fase C:** usar `accounts.length` como denominador real (ya está disponible), o `—` cuando `accounts.length === 0`.

### 4.3 `src/App.tsx:267`

```tsx
<StatCard
  title="Publicaciones hoy"
  value={`${publishedToday}`}
  hint="+12% vs ayer"        // ❌ porcentaje inventado
  ...
/>
```

- **Problema:** "+12% vs ayer" es literal hardcoded; no hay cálculo real.
- **Solución Fase C:** eliminar el hint o calcularlo a partir de métricas reales cuando exista histórico (no es nuestro caso). Sustituir por string vacío o tooltip de fuente.

### 4.4 `src/components/AccountsPanel.tsx:30`

```tsx
const [newSerial, setNewSerial] = useState('RFCW80' + Math.floor(10000 + Math.random() * 90000));
```

- **Problema:** default placeholder inventado. No se persiste hasta submit, pero la TASK pide no simular.
- **Solución Fase C:** `useState('')` y placeholder HTML.

---

## 5. Riesgos / superficie peligrosa detectada (TASK §24)

1. **AdbBridge** (`AdbBridgeModal`) — permitir entrada libre podría exponer `adb shell <input>`. Verificado en backend (`server/app.ts` + `platform/phonefarm/platform.py: adb_*`): solo allowlisted actions. **OK**.
2. **CodeViewer** (`CodeViewerModal`) — read-only. **OK** en producción. La TASK pide flag `ENABLE_DEV_CODE_EDITOR` explícito para futura edición.
3. **cURL explorer** (`CurlTesterModal`) — ejecuta contra el propio panel con la sesión del usuario. Si el usuario es admin, podría usarse para invocar `/api/source` o `/api/download-zip` (endpoints sensibles). **OK en RBAC actual** (admin only). Documentar.
4. **MoneyPrinter config** — `mptSettingsSchema` rechaza secretos y valores con `=` o `\n` (cubierto por test rbac). **OK**.
5. **Export ZIP** — solo admin, exige reauth (cubierto por test rbac). **OK**.
6. **Logs SSE** — buffer 64 KiB. Riesgo bajo de fuga de secretos (no se loguea `password`). Verificado en `server/passwords.ts` (no devuelve hash).
7. **Secretos en bundle** — verificado por `.gitleaks.toml` + `.env` en `.gitignore` + `.env.example` sin secretos. **OK**.

---

## 6. Mapeo de estados de cola a pipeline visual (TASK §11.1)

| Estado interno (real) | Bucket UI |
|---|---|
| `pending` | Queued |
| `scripting` | Generating |
| `generating` | Generating |
| `awaiting_approval` | Generating (con bloqueo de revisión) |
| `awaiting_preview` | Generating |
| `ready_for_publish` | Ready |
| `publishing` | Publishing |
| `published` | Completed |
| `failed` | Failed |
| `rejected` | Failed |
| `awaiting_manual_upload` | Failed (con acción "Reintentar / Subir manual") |

---

## 7. Catálogo de fuentes (resumen — ver `METRICS_CATALOG.md` para definiciones completas)

| metric_key | Fuente | Unidad | Ventana | Estado fuente |
|---|---|---|---|---|
| `devices_online` | `/api/adb/devices` | count | real-time | REAL |
| `accounts_active` | `/api/accounts` filtrado `status==='active'` | count | real-time | REAL |
| `jobs_running` | `/api/queue` filtrado estados activos | count | real-time | REAL |
| `published_total` | `/api/queue` filtrado `status==='published'` | count | histórico (sin filtro hoy) | PARCIAL |
| `success_rate_pct` | calculado: 100 - errores/(jobs) | % | 5-min rolling | REAL derivado |
| `alerts_count` | `stats.errores` | count | real-time | REAL |
| `cpu_percent` | `/api/stats` (psutil) | % | real-time | REAL |
| `ram_percent` | `/api/stats` (psutil) | % | real-time | REAL |
| `disk_percent` | `/api/stats` (psutil) si implementado en Flask | % | real-time | PARCIAL (puede llegar `null` → `—`) |
| `proxies_online_total` | `/api/proxies` | count | real-time | REAL |
| `proxy_latency_ms` | `/api/proxies/verify` | ms | bajo demanda | REAL (caché 60 s) |
| `bots_active` | `/api/stats.active_bots` | count | real-time | REAL |
| `mpt_online` | `/api/stack.mpt_online` (ping /ping) | bool | 10 s cache | REAL |
| `flask_online` | `/api/stack.flask_online` | bool | 10 s cache | REAL |
| `drafts` | `/api/stack.drafts` | count | 10 s cache | REAL |

---

## 8. Decisión del TASK aplicada al repo

- **No se borra el design system actual**, se **extiende** con tokens de operaciones más específicos (estado de dispositivo, lease, latencia proxy, RSSI red).
- **No se reescribe el theme actual**, se reescribe el `prefers-reduced-motion` para que sea CSS válido.
- **Se conservan** Matrix Green (`#00FF88`) como brand y el lenguaje `@theme` + `@layer utilities`. La TASK pide evaluar alternativas: el brand actual ya es operacional y denso; se mantiene con justificación documentada en `TYPOGRAPHY_RESEARCH.md`.
- **Mocks eliminados**: §4.1, §4.2, §4.3, §4.4. Se cambia a estado real o `—`.

---

## 9. Conclusión del audit

- **Gate A (TASK §2):** ✅ PASADO. Se conoce el origen de cada dato del dashboard actual.
- **Gate C (TASK §9):** parcialmente bloqueado por las regresiones fake §4.1–§4.3; se eliminan en este rediseño.
- **Gate E (TASK §13):** pendiente — requiere pin MPT + adapter (Fase E).
- **Gate H (TASK §25):** pendiente — tests E2E, visual regression.

Estado del proyecto: **adaptable al TASK sin reescritura mayor**, ya que el frontend es oscuro y denso y el backend tiene todas las fuentes reales. La principal carga del TASK es **eliminar las regresiones fake** y **endurecer MoneyPrinter/ADB/Python** según §13/§14/§17.

---

## 10. Procedimiento para reproducir este audit

```powershell
cd C:\Users\haxth3\Documents\phone-farm-platform
git rev-parse HEAD
ls src/components
ls platform/phonefarm
git -C platform\third_party\MoneyPrinterTurbo rev-parse HEAD
bunx vitest run
& "platform\.venv\Scripts\python.exe" -m pytest platform/tests -q --tb=no
```

---

**Fin del audit.** Siguiente gate: ADR-007 + tokens Fase B; correcciones de Fase C; integraciones Fase E–H.