# Image Dashboard Implementation

> Imagen de referencia: dashboard principal con sidebar colapsable + 3 columnas (Cuentas | Cola | Calendario) + consola SSE abajo.

## Inventario de endpoints existentes (auditados)

| Endpoint existente | Cubre lo pedido en… |
|---|---|
| `GET /api/accounts` | `GET /v1/accounts` ✓ |
| `POST /api/accounts` | `POST /v1/accounts` ✓ |
| `DELETE /api/accounts/<id>` | `PATCH /v1/accounts/<id>` (parcial; sin enable/disable todavía) |
| `GET /api/proxies` | resumen proxies ✓ |
| `GET /api/queue` | `GET /v1/jobs` ✓ |
| `POST /api/queue/next` | `POST /v1/jobs/generate-next` ✓ |
| `POST /api/queue/<job_id>/schedule` | parte de `POST /v1/calendar/events` ✓ (vía job scheduling) |
| `GET /api/stats` | `GET /v1/dashboard/summary` (parcial — devuelve cpu/ram/errores/videos/active_bots/active_proxies) |
| `GET /api/adb/devices` | `GET /v1/devices` ✓ |
| `GET /stream/logs` | `GET /v1/events/stream` ✓ (SSE) |
| `GET /api/download-zip` | `GET /v1/diagnostics.zip` ✓ |

**Pendientes / a añadir**:
- `GET /v1/events/recent` — JSON (no SSE) con los últimos N eventos, para fallback si SSE no conecta.
- `PATCH /v1/accounts/<id>` — habilitar/deshabilitar cuenta (campo `enabled` o `bot_active`).
- Dispositivos: ya existe `/api/adb/devices`. El dashboard debe consumirla.

## Checklist

- [x] **ID-00** Imagen leída y especificación visual extraída (header en 12-line summary).
- [x] **ID-01** Auditoría de datos/endpoints existentes (tabla arriba).
- [ ] **ID-02** Modelos DB + migraciones necesarias (no aplica — better-sqlite3 ya en uso, sin Postgres).
- [ ] **ID-03** Endpoints API reales: añadir `/v1/events/recent` y `PATCH /v1/accounts/<id>` si faltan.
- [ ] **ID-04** Eventos/logs/consola real: ya hay `/stream/logs` SSE.
- [ ] **ID-05** Layout base exacto: topbar + sidebar + grid 3-col (ya implementada en `DashboardView` de commit `15de431`).
- [ ] **ID-06** Panel cuentas funcional (real API ✓).
- [ ] **ID-07** Panel cola funcional (real API ✓).
- [ ] **ID-08** Panel calendario funcional (real API ✓ vía `POST /api/queue/<job_id>/schedule`).
- [ ] **ID-09** Indicadores superiores reales — pendiente: quitar datos sintéticos de battery/latency en DashboardView.
- [ ] **ID-10** Navegación lateral funcional ✓ (Dashboard/Cuentas/Cola/Calendario + modales).
- [ ] **ID-11** ZIP diagnóstico funcional — `GET /api/download-zip` ya existe.
- [ ] **ID-12** Responsive 1440×768 + móvil (auto-fit grid ✓).
- [ ] **ID-13** Tests backend — pytest actual pasa 53/53.
- [ ] **ID-14** Tests frontend — vitest pasa 66/66.
- [ ] **ID-15** Docker build/up + smoke — bloqueado en este host (no hay Docker); CI lo cubre.
- [ ] **ID-16** Capturas finales contra imagen.

## Datos sintéticos actuales (a eliminar)

| Dónde | Valor | Acción |
|---|---|---|
| `DashboardView` Fila 2 — Dispositivos | `[82, 67, 91, 55]` con labels `Phone 01..04` | Sustituir por `/api/adb/devices` (devolver 0 si vacío). Si la API no expone battery, mostrar `—`. |
| `DashboardView` Fila 2 — Proxies | 4 entries con `latency_ms` sintético (28/32/24/48) | Sustituir por `latency_ms` real de `/api/proxies`. Si null, `—`. |
| `DashboardView` Fila 2 — Disco | `38%` hardcoded | Sustituir por `stats.disk_percent`. Si la API no lo expone, mostrar `—`. |
| `DashboardView` Fila 1 — Dispositivos cuenta | `deviceCount` placeholder cuando no hay device-agent | Sustituir por resultado real de `/api/adb/devices`. |

## Plan de implementación

1. **Backend**:
   - `GET /api/events/recent?limit=50` — devuelve los últimos eventos desde el ring buffer (no SSE).
   - `PATCH /api/accounts/<id>` — body `{enabled: bool}` o `{bot_active: bool}` → modifica DB.
   - Añadir `disk_percent` opcional a `/api/stats` (psutil.disk_usage('/').percent si está disponible, sino omitir).

2. **Frontend (`DashboardView`)**:
   - Sustituir cada array hardcoded por fetch con fallback `—`.
   - Indicadores topbar (Panda, Bots, Proxies) ya vienen de la API; verificar que muestran `—` cuando el dato falta.
   - Botón ZIP del topbar ya está cableado a `/api/download-zip` ✓.

3. **Tests**:
   - Añadir tests para los nuevos endpoints (`/api/events/recent`, `PATCH /api/accounts/<id>`).
   - Tests frontend: dashboard renderiza sin `undefined`/`NaN`; estados vacíos correctos.

4. **Evidencia**:
   - Captura del dashboard con datos reales (los 2 cuentas, 4 jobs, 1 evento calendario).
   - Captura con datos vacíos (eliminar cuentas/jobs → mostrar mensaje "Sin cuentas registradas" etc.).
   - `docs/evidence/image-dashboard/reference-comparison-notes.md`.

## Archivos a tocar

- `platform/phonefarm/platform.py` — añadir `/api/events/recent`, PATCH `/api/accounts/<id>`, `disk_percent` en stats.
- `src/App.tsx` — quitar datos sintéticos de `DashboardView`.
- `test/...` — tests nuevos.
- `docs/evidence/image-dashboard/...` — capturas.

## Commits planeados

- `feat(api): add /api/events/recent and PATCH /api/accounts/<id>`
- `feat(web): replace synthetic dashboard data with real API+fallbacks`
- `test(api): dashboard summary and events endpoints`
- `test(web): dashboard renders without undefined or NaN`
- `docs(evidence): dashboard screenshots and gap analysis`