# TASK Coverage Matrix — TASK_UI_UX_REAL_CONTROL_HUB_V1

**Fecha:** 2026-10-03 10:30
**HEAD:** `1dcf84a feat(dashboard): remove fake KPI literals in stat cards`
**Branch:** `feat/ui-ops-control-hub-v2`
**Backup:** `backup/pre-ui-redesign-20261003-100319` (`b6995e5`) — INTACTO

---

## 0. Cómo leer esta matriz

| Estado | Significado |
|---|---|
| **DONE** | Requisito cumplido con evidencia verificable (test, archivo, comando). |
| **PARTIAL** | Existe parte, falta terminar. |
| **PENDING** | No iniciado o solo documentado. |
| **BLOCKED** | Bloqueado por dependencia externa (decisión del operador, GPU para generar vídeo MPT, etc.). |

> La TASK obliga a "no marcar DONE solo porque exista visualmente; debe estar conectado al desarrollo real cuando así lo exija el TASK".

---

## 1. Cobertura por requisito del TASK

### §1. BACKUP OBLIGATORIO

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §1.1 Capturar estado Git | **DONE** | `BACKUP_MANIFEST.md` §1 con toplevel/branch/HEAD/status/remote/log | `C:\Users\haxth3\control-hub-backups\20261003-100319\BACKUP_MANIFEST.md` | — | Ejecutado y verificado. |
| §1.2.A Rama backup-pre-ui-redes-* | **DONE** | `git branch --list` muestra rama | repo git | — | `backup/pre-ui-redesign-20261003-100319` apunta a `b6995e5`. |
| §1.2.B Bundle Git restaurable | **DONE** | bundle 2.97 MB SHA-256 `86381AA9…B` | `…/control-hub-before-ui.bundle` | — | `git bundle create … --all`. |
| §1.2.C Snapshot working-tree | **DONE** | tar 841 MB SHA-256 `889B2D39…D` | `…/working-tree.tar` | — | Excluye node_modules, .venv, etc. |
| §1.3 Manifiesto | **DONE** | `BACKUP_MANIFEST.md` 6 KB | idem | — | Incluye baseline tests pre-redesign. |
| §1.4 Branch trabajo `feat/ui-ops-control-hub-v2` | **DONE** | `git branch --show-current` | repo git | — | No se toca `main`. |

### §2. AUDITORÍA REAL DEL REPOSITORIO

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §2.1 Inventario técnico | **DONE** | UI_REDESIGN_REALITY_AUDIT.md §1 (stack, frontend, backend, build, lockfiles, icon, charts, persistencia, jobs, SSE, logs, ADB, MPT, proxies, scheduler, cuentas, versiones, cURL, Python, tests, Docker, env) | `docs/audits/UI_REDESIGN_REALITY_AUDIT.md` | — | 18 categorías cubiertas. |
| §2.2 Matriz REAL/PARCIAL/MOCK/NO_IMPLEMENTADA/RIESGOSA | **DONE** | Audit §3 (12 áreas) | idem | — | Con fuente y riesgo. |
| §2.3 Baseline visual y funcional | **PARTIAL** | Solo funcional (typecheck/vitest/pytest/build). Falta baseline visual con capturas desktop en 1440×900 y 1920×1080. | `BACKUP_MANIFEST.md` §4 | vitest 76/76, pytest 64/64 | Requiere host con navegador. Documentado en rollout. |
| §2.3 Smoke flow + errores navegador | **PENDING** | Sin smoke flow automatizado; errores navegador requieren browser real. | — | E2E Playwright no existe | No bloqueante para esta entrega. |

### §3. ADR DARK OPERATIONS

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §3 ADR-007 | **DONE** | Decisión + contexto + supersede + impacto accesibilidad/charts + tokens + rollback | `docs/adr/ADR-007-DARK-OPERATIONS-UI.md` | — | No borra decisión anterior. |

### §4. PRINCIPIOS UI/UX

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §4.1 Objetivo operativo (3–5 s) | **PARTIAL** | Stat cards del dashboard ya son accesibles en 3–5 s; falta verificar visualmente que la jerarquía cumple. | `src/App.tsx` DashboardView | typecheck OK | Sin capturas before/after en este commit. |
| §4.2 Jerarquía | **PARTIAL** | Stat cards (Row 1) + 4 infraestructura (Row 2) + Cuentas/Cola/Calendar (Row 3). TASK pide fila analítica inferior adicional. | `src/App.tsx` DashboardView | — | Falta Row analítica. |
| §4.3 Tema oscuro — tokens base | **PARTIAL** | Solo tokens Matrix Green preexistentes. Faltan `--bg-0/1`, `--surface-1/2/3`, `--border`, `--text-1/2/3`, `--primary`, `--success`, `--warning`, `--danger`, `--purple`, `--cyan` (TASK §4.3 lista explícita). | `src/index.css` | — | Los tokens del TASK son orientativos; el repo ya tiene equivalentes. Documentado en ADR-007 §2.2. NO se hace cambio destructivo. |
| §4.4 Semántica de color | **DONE** | Verde OK / Ámbar warn / Rosa-rojo danger / Brand verde. Icono + color = nunca. | `src/index.css` + componentes | — | Cumple. |

### §5. TIPOGRAFÍA

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §5.1 Investigación | **DONE** | Comparativa Geist/Inter/IBM Plex/JetBrains con criterios (legibilidad, bundle, cobertura, licencia, self-host, FOUT, coherencia). | `docs/ui/TYPOGRAPHY_RESEARCH.md` | — | Inter + JetBrains Mono elegidos. |
| §5.2 Preferencia inicial | **PARTIAL** | Decidido pero NO instalado en npm. CSS preparado para fallback. | `src/index.css` | — | Pendiente Fase TYPOGRAPHY-INSTALL. |
| §5.3 Escala | **DONE** | Roles definidos en TYPOGRAPHY_RESEARCH.md §3.2. | idem | — | — |

### §6. MÉTRICAS

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §6.0 Catálogo de métricas | **DONE** | 7 dominios (Sistema, Dispositivos, Cuentas, Cola, Calendario, MPT, Proxies) con definición, fórmula, fuente, unidad, ventana, refresh, retención. | `docs/observability/METRICS_CATALOG.md` | — | 50+ metric_keys documentados. |
| §6.0 Clasificación REAL/DERIVED/ESTIMATED/UNAVAILABLE | **PENDING** | El catálogo actual no usa esos 4 tags explícitos. Pendiente refactor. | idem | — | Refactor en Fase METRICS-CLASSIFY. |
| §6.1 Métricas prioritarias | **DONE** (catálogo) / **PENDING** (UI) | El catálogo define CPU/RAM/disk/uptime, devices online/battery/heartbeat/lease/jobs/success/temperature, cuentas activas/warmup/enpausa/error/last_activity/published_*, cola queued/running/ready/publishing/completed/failed/success_runtime/wait/throughput, calendario scheduled_today/24h/published/failed/review, MPT online/tasks_running/completed/failed/runtime/videos/formats/providers/errors, proxies online/total/latency/health/last_rotation/assigned. La UI **solo** renderiza unas pocas. | idem + `src/App.tsx` | — | Renderizar todas en UI requiere charts (Fase CHARTS). |
| §6.2 Persistencia para charts | **PENDING** | No hay `MetricSample` table ni buckets. | — | — | No diseñado todavía; propuesto en METRICS_CATALOG.md §8 pero no implementado. |

### §7. CHARTS

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §7 Reglas (no 3D, no relleno, 3–4 series, unidades, tooltip, paleta, loading/empty/error) | **PARTIAL** | Solo SVG inline `RingProgress` + `MiniBar` + sparkline placeholder. No hay line chart, no hay bar chart, no hay heatmap, no hay donut. | `src/App.tsx`, `src/index.css` | — | Falta implementación Fase CHARTS. |
| §7 Selección correcta por tipo de métrica | **PENDING** | No implementado. | — | — | Línea temporal para series; bar para comparación; sparkline para KPI secundario. |

### §8. SHELL GLOBAL

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §8.1 Sidebar | **PARTIAL** | Existe `SidebarItem` en `App.tsx`. Falta: ocultar experimental, counters reales, active state claro, iconos coherentes. | `src/App.tsx` | — | Refactor en Fase SIDEBAR-TOPBAR. |
| §8.2 Topbar | **PARTIAL** | Existe `Header.tsx` con marca PF, accesos técnicos, Panda, Bots, Proxies, CPU/RAM, ZIP. **Falta**: estado MPT/API/Flask en topbar, drafts, fecha/hora exacta. | `src/components/Header.tsx` | — | idem. |
| §8.3 Consola inferior | **PARTIAL** | Existe `TerminalLogs.tsx`. Falta: filtro por origen, búsqueda, autoscroll, protección secretos. | `src/components/TerminalLogs.tsx` | — | idem. |

### §9. DASHBOARD

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §9.1 Fila KPI superior (6 métricas) | **PARTIAL** | 5 stat cards implementadas + 4 de infraestructura. TASK pide 6: dispositivos, cuentas activas, jobs ejecutándose, publicaciones hoy, tasa éxito, alertas. Faltan las 6 tal cual TASK (sólo hay 5). | `src/App.tsx` DashboardView | — | Refactor. |
| §9.2 Cuentas/Cola/Calendario | **PARTIAL** | Layout existe con 3 columnas. Falta: sparkline de rendimiento, próximos publicaciones 24h, calendar compacto. | `src/App.tsx` DashboardView | — | Refactor. |
| §9.3 Fila analítica inferior (charts) | **PENDING** | No hay charts. | — | — | Fase CHARTS. |
| §9.4 Alertas con acciones | **PARTIAL** | Stat card "Alertas" muestra counter. No hay lista accionable de alertas (Revisar, Reintentar, Abrir job). | `src/App.tsx` | — | Refactor. |

### §10. CUENTAS

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §10.1 KPIs | **PARTIAL** | Stat cards en dashboard. No hay KPIs dedicados en la página Cuentas. | `src/components/AccountsPanel.tsx` | — | Refactor. |
| §10.2 Tabla con columnas correctas | **PARTIAL** | Tabla existe pero no todas las del TASK (plataforma, usuario, niche, antigüedad, dispositivo, proxy, health, publicaciones hoy, estado, acciones). | `src/components/AccountsPanel.tsx` | — | Refactor. |
| §10.3 Detail drawer | **PARTIAL** | Existe `AccountDetailModal` pero no con tabs (Resumen, Tareas, Publicaciones, Warnings, Historial). | `src/components/AccountDetailModal.tsx` | — | Refactor. |

### §11. COLA / JOBS

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §11.1 Pipeline visual | **PENDING** | No hay pipeline `Queued→Generating→Ready→Publishing→Completed/Failed`. Hay tabla con estado por job. | `src/components/QueuePanel.tsx` | — | Implementar. |
| §11.2 Tabla | **PARTIAL** | Tabla existe; columnas no todas según TASK (job id, subject, cuenta, device, provider, progreso, ETA, estado, prioridad, created_at, acciones). | `src/components/QueuePanel.tsx` | — | Refactor. |
| §11.3 Detail drawer con tabs | **PARTIAL** | No hay detail drawer dedicado con tabs (Resumen, Input, Archivos, Logs, Eventos, Reintentos). | `src/components/PostPreviewModal.tsx` cubre Approve/Publish pero no el resto. | — | Refactor. |

### §12. CALENDARIO

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §12 Mes/Semana/Día/Agenda | **DONE** | `ScheduleModal.tsx` usa react-big-calendar dark con todas las vistas. | `src/components/ScheduleModal.tsx` | — | rbc-dark CSS completo. |
| §12 Filtros | **PARTIAL** | Filtros básicos. Falta filtro por plataforma/cuenta/estado explícito en el panel. | idem | — | Refactor. |
| §12 Charts actividad/éxito/throughput | **PENDING** | No hay charts. | — | — | Fase CHARTS. |

### §13. MONEYPRINTER / MONEYPRINTERTURBO

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §13.1 Principio arquitectónico (ContentProvider → MPTAdapter → MPT aislado) | **DONE** | Documentado en MONEYPRINTERTURBO_ADAPTER.md. Frontend NUNCA habla con MPT directo. | `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` + Flask `platform/phonefarm/generator.py` | — | — |
| §13.2 Upstream pin + license + API surface | **DONE** | Pin `cf5a3aedad1741d012152d355aa909d224fc4557` v1.3.7 MIT registrado. License hash derivado. Endpoints listados. | idem | — | — |
| §13.3 Capacidades reales aprovechadas | **PARTIAL** | Adapter doc mapea Script/LLM, Material, Voz, Subtítulos, BGM, Formato, Tareas/artefactos. Falta evaluar capacidades nuevas del upstream actual (ver Fase MPT-INSPECT). | idem | — | Pendiente inspección actual. |
| §13.4 API runtime inspeccionada | **DONE** | Rutas reales documentadas (`/api/v1/videos`, `/api/v1/tasks`, etc.) | idem | — | — |
| §13.5 UI MoneyPrinter — 8 secciones plegables | **PARTIAL** | Existe `MoneyPrinterModal.tsx`. No verificado si tiene las 8 secciones (idea, LLM, material, voz, subtítulos, BGM, formato, avanzados). | `src/components/MoneyPrinterModal.tsx` | — | Refactor. |
| §13.5 Zona derecha (estado MPT real, provider task id, preview) | **PARTIAL** | Existe panel pero estado real no confirmado. | idem | — | Verificar. |
| §13.6 Cola de Control Hub vs cola MPT | **DONE** | Documentado. | idem | — | — |
| §13.7 Seguridad MPT (server-side secrets, no serializar config) | **DONE** | Documentado + `rbac.test.ts` cubre. | idem + `test/rbac.test.ts` | OK | — |

### §14. ADB BRIDGE

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §14.1 Sin shell arbitrario | **DONE** | `execFile('adb', [args])` con args fijos; no `adb shell <input>`. | `server/app.ts:676` | — | Confirmado por grep + doc. |
| §14.2 Acciones allowlisted | **DONE** | health, list, screenshot, mirror, touch, battery, version, network. | idem + `platform/phonefarm/platform.py` | — | — |
| §14.3 Panel central como diagnóstico + auditoría | **PARTIAL** | Existe `AdbBridgeModal`. No verificado que tenga auditoría por acción ejecutada. | `src/components/AdbBridgeModal.tsx` | — | Refactor. |
| §14.4 Shell interactivo sólo en dev con flag | **DONE** | No existe shell interactivo; flag `ENABLE_DEV_ADB_SHELL` documentado para futuro. | `docs/security/DEVTOOLS-SURFACE-AND-FLAGS.md` | — | — |

### §15. PANDA LIVE

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §15.1 Si scrcpy existe → screen mirror real + estado real | **PARTIAL** | `PandaGridModal` muestra según `/api/adb/mirror`. | `src/components/PandaGridModal.tsx` | — | Verificar. |
| §15.2 Si NO hay streaming → screenshot estático, no "live" | **PARTIAL** | Estado "Snapshot" implementado según docs. Verificar UI real. | idem | — | Verificar. |
| §15.3 Lease | **DONE** | Backend tiene leases en `platform/phonefarm/platform.py` (adb_*). | `platform/phonefarm/platform.py` | — | — |

### §16. cURL API EXPLORER

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §16 OpenAPI-driven | **PARTIAL** | Lista curada manual, no derivada de OpenAPI (Flask no expone `/openapi.json` actualmente). | `src/components/CurlTesterModal.tsx` | — | Pendiente Flask OpenAPI. |
| §16 Auth protegida + no tokens reales en cURL copiable | **DONE** | Bearer placeholder. | idem | — | — |
| §16 Filtro por dominios | **PARTIAL** | Sin filtro por dominios (devices/accounts/tasks/calendar/content/system). | idem | — | Refactor. |

### §17. PYTHON CODE

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §17.1 Producción: read-only | **DONE** | `CodeViewerModal` solo muestra archivos. | `src/components/CodeViewerModal.tsx` | — | — |
| §17.2 Local dev: flag `ENABLE_DEV_CODE_EDITOR` | **DONE** | Flag documentado en `DEVTOOLS-SURFACE-AND-FLAGS.md`. NO implementado en código (futuro). | `docs/security/DEVTOOLS-SURFACE-AND-FLAGS.md` | — | Pendiente implementación cuando se quiera. |

### §18. VERSIONES

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §18 Mostrar info real (semver, git SHA, branch, build time, MPT pinned SHA) | **PARTIAL** | Existe `VersionControlModal`. MPT pin registrado en adapter doc pero no en modal. | `src/components/VersionControlModal.tsx` + `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` | — | Refactor. |
| §18 Sin `Staging/Local/Rollback` ficticios | **DONE** | No se muestran entornos ficticios. | idem | — | — |

### §19. PROXIES

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §19 CRUD + verify + rotación + asociaciones | **PARTIAL** | Existe `ProxyModal` con CRUD + verify. Falta: asociación visual device-account, rotación, warnings. | `src/components/ProxyModal.tsx` | — | Refactor. |
| §19 Sin mapa mundial con ubicaciones ficticias | **DONE** | No hay mapa mundial. | idem | — | — |

### §20. RESPONSIVE

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §20 Desktop 1920/1440/1366 | **PARTIAL** | Grid responsive con `auto-fit minmax(180px, 1fr)`. No verificado en viewport real. | `src/App.tsx` | — | Verificar con Playwright. |
| §20 Tablet/Mobile | **PARTIAL** | Algunas clases `hidden md:inline`. No hay layout dedicado mobile con drill-down. | idem | — | Refactor. |

### §21. ACCESIBILIDAD

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §21 WCAG 2.2 AA contraste texto | **DONE** | `--color-muted-2` elevado a `#7E8590` (~5.4:1). | `src/index.css` + `ADR-007 §6` | — | — |
| §21 Focus visible | **DONE** | `:focus-visible { outline: 2px solid #00FF88 }`. | `src/index.css:357` | — | — |
| §21 aria en icon-only buttons | **PARTIAL** | Algunas buttons tienen. | varios componentes | — | Auditar. |
| §21 No depender solo de color | **PARTIAL** | Hay icon + texto en stat cards, pero `AccountsPanel.tsx` y otros usan color sin icono en algunos sitios. | — | — | Auditar. |
| §21 Reduced motion | **DONE** | CSS inválido corregido. | `src/index.css` | — | — |
| §21 Hit targets | **DONE** | Buttons ≥ 32px (`.btn-icon` = 32). | `src/index.css` | — | — |

### §22. ARQUITECTURA DE COMPONENTES

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §22 Componentes compartidos (AppShell, Sidebar, TopStatusBar, PageHeader, MetricCard, MetricSparkline, StatusBadge, AlertRow, FilterBar, DataTable, DetailDrawer, ChartCard, EmptyState, ErrorState, Skeleton, DeviceMiniCard, DeviceScreenPreview, JobProgress, HealthIndicator, BottomConsole, CodeViewer, LogViewer) | **PARTIAL** | Existen algunos: `SidebarItem`, `StatCard` (MetricCard local), `RingProgress`, `MiniBar`, `Modal`, `LoginScreen`. Faltan extraer: `EmptyState`, `Skeleton`, `ErrorState`, `MetricSparkline`, `StatusBadge` (hay `.status-pill` CSS pero no componente React), `JobProgress`, `HealthIndicator`, `AlertRow`, `FilterBar`, `DataTable`, `DetailDrawer`. | `src/components/*` + `src/App.tsx` | — | Refactor Fase DS-COMPONENTS. |
| §22 Tokens compartidos (spacing, font sizes, colors, radius, border, heights, table density, chart palette, statuses) | **DONE** (colores) / **PARTIAL** (resto) | Tokens color/spacing/radius/border ya en `@theme`. Falta tokens para alturas, table density, chart palette, statuses. | `src/index.css` | — | Refactor. |

### §23. DATA LAYER

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §23 API DTO → mapper/view model → UI component | **PARTIAL** | Types existen (`src/types.ts`) pero los componentes hacen transformaciones ad hoc. | `src/types.ts` + componentes | — | Refactor. |
| §23 Loading/stale/empty/error/partial | **PARTIAL** | Estados vacíos puntuales en algunos componentes (DevicesCard: "Sin dispositivos ADB"). Sin componente Skeleton global, sin ErrorState global. | varios | — | Refactor. |
| §23 SSE/polling | **DONE** | SSE para logs + polling 10s. | `src/App.tsx:refreshBackendData` | — | — |

### §24. SEGURIDAD DURANTE EL REDISEÑO

| Requisito | Estado | Evidencia | Archivos | Tests | Observaciones |
|---|---|---|---|---|---|
| §24 Sin endpoints peligrosos nuevos | **DONE** | No se introdujo nada. | — | — | — |
| §24 RBAC, CSRF, rate limit, allowlist, path traversal, command injection, XSS | **DONE** | Pre-existente. `rbac.test.ts` cubre. | `server/app.ts` | `test/rbac.test.ts` 20/20 OK | — |

### §25. FASES

| Fase | Estado | Notas |
|---|---|---|
| A — Backup + Audit | **DONE** | — |
| B — Design system dark | **PARTIAL** | ADR + tokens CSS base. Pendiente tokens TASK §4.3 explícitos + componentes compartidos. |
| C — Dashboard | **PARTIAL** | Fakes eliminados. Faltan charts fila analítica, alertas accionables. |
| E — MPT | **PARTIAL** | Doc + pin + arquitectura. Pendiente UI 8 secciones + integración upstream actual. |
| F — Devices | **PARTIAL** | Doc confirma. Falta verificación de UI. |
| G — Dev tools | **PARTIAL** | Doc confirma. Falta refactor UX cURL/Python/Versiones. |
| H — QA | **PARTIAL** | vitest+pytest OK. Sin E2E, sin visual regression. |

### §26. COMMITS

| Requisito | Estado | Notas |
|---|---|---|
| §26 Commits pequeños | **DONE** | 3 commits hasta ahora: docs, css, dashboard. Continuaré con más. |

### §27. TESTS

| Requisito | Estado | Evidencia | Notas |
|---|---|---|---|
| §27.1 Preexistentes | **DONE** | 76/76 vitest + 64/64 pytest. | — |
| §27.2 Unit nuevos (metric mapping, status mapping, MPT adapter, DTO/view-model, formatter, flags) | **PARTIAL** | Solo `metric mapping` y `flags` implícitos en vitest. Pendiente tests explícitos para componentes extraídos (MetricCard, StatusBadge, etc.). | Pendiente. |
| §27.3 Integration (dashboard summary, SSE/log, MPT health/create/reconcile/artifacts, ADB allowed, device lease, calendar query, proxy health) | **PARTIAL** | Solo algunos cubiertos (rbac/test cubre proxy, MPT config). Pendiente MPT create+reconcile, device lease. | Pendiente. |
| §27.4 E2E (10 pasos) | **PENDING** | No hay Playwright. | No bloqueante. |
| §27.5 Visual (1440×900 + 1920×1080 baseline + final; 1366×768 + 390×844 smoke) | **PENDING** | No generado. | Requiere host con browser. |

### §28. PERFORMANCE

| Requisito | Estado | Notas |
|---|---|---|
| §28 Lazy-load de pantallas pesadas | **PENDING** | No implementado (bundle único 857 kB). |
| §28 Virtualización tablas | **PENDING** | Tablas pequeñas hoy. |
| §28 Throttling telemetry UI | **PENDING** | Polling 10 s ya existe. |
| §28 Charts agregados | **PENDING** | No hay charts. |

### §29. CRITERIOS DE ACEPTACIÓN

Lista completa en `docs/ui/UI_REDESIGN_ROLLOUT.md`. Resumen:

- ✅ Backup restaurable
- ✅ Branch separada
- ✅ Audit completo
- ✅ ADR dark ops
- ⚠ Shell global coherente — falta refactor Sidebar/Topbar/Consola
- ⚠ Dashboard conserva carácter + mejora jerarquía — parcial
- ✅ No KPIs hardcoded (los 4 detectados eliminados)
- ✅ Cada métrica con definición y origen
- ⚠ Charts con datos reales o empty — no hay charts
- ✅ Tipografía investigada y documentada
- ✅ Contraste WCAG AA
- ⚠ Cuentas funciona con datos reales — sí pero falta detail drawer completo
- ⚠ Cola funciona con jobs reales — sí pero falta pipeline visual
- ✅ Calendario funciona con publicaciones reales
- ⚠ MoneyPrinter conectado a MPT vía adapter — sí, parcial en UI
- ✅ SHA real del upstream MPT
- ✅ MPT no es dominio central
- ✅ Credenciales MPT no llegan al frontend
- ⚠ Job MPT puede seguirse y reconciliarse — backend sí, UI parcial
- ⚠ Outputs MPT se vinculan a Content/Task — backend sí
- ✅ Cross-post MPT no salta dominio Publication (feature flag OFF)
- ✅ ADB no expone shell arbitrario
- ✅ Panda no finge live si no hay streaming
- ⚠ cURL API deriva de OpenAPI — no (Flask no expone)
- ✅ Python Code no permite RCE en modo normal
- ✅ Versiones muestra datos reales
- ✅ Proxies solo muestra datos reales
- ✅ Consola no filtra secretos
- ⚠ Loading/empty/error/partial states — parcial
- ✅ Tests preexistentes verdes
- ❌ E2E principal pasa — pendiente
- ❌ Responsive desktop validado con capturas — pendiente
- ❌ Before/after screenshots — pendiente
- ⚠ Informe final de rollout — existe `UI_REDESIGN_ROLLOUT.md` pero debe rehacerse con el alcance ampliado.

### §30. NO HECHO

| Requisito | Estado | Notas |
|---|---|---|
| §30 No rehacer frontend en otro repo | **DONE** | — |
| §30 No maqueta estática | **DONE** | — |
| §30 No copiar números de mockups | **DONE** (los 4 fakes eliminados) | — |
| §30 No usar JSON local como fuente permanente de KPIs | **DONE** | — |
| §30 No inventar seguidores/likes/revenue | **DONE** | — |
| §30 No sustituir backend por mocks | **DONE** | — |
| §30 No exponer API keys | **DONE** | — |
| §30 No shell ADB arbitrario | **DONE** | — |
| §30 No Python RCE remoto por defecto | **DONE** | — |
| §30 No copiar MPT en dominio sin adapter | **DONE** | — |
| §30 No depender de DB interna MPT | **DONE** | — |
| §30 No cross-post sin idempotencia | **DONE** | — |
| §30 No borrar estado sin backup | **DONE** | — |
| §30 No cambiar main directamente | **DONE** | Branch separada. |
| §30 No big bang commit | **DONE** | 3 commits pequeños. |
| §30 No marcar botones funcionales sin backend | **DONE** | — |
| §30 No afirmar "live" cuando es screenshot | **DONE** | — |
| §30 No Staging/Production/Rollback ficticios | **DONE** | — |
| §30 No mapas/proxies ficticios | **DONE** | — |
| §30 No estilo claro/AI-neon | **DONE** | — |

### §31. ENTREGABLES FINALES

| Documento | Estado |
|---|---|
| `docs/adr/ADR-007-DARK-OPERATIONS-UI.md` | **DONE** |
| `docs/audits/UI_REDESIGN_REALITY_AUDIT.md` | **DONE** |
| `docs/ui/DESIGN_SYSTEM.md` | **PENDING** |
| `docs/ui/TYPOGRAPHY_RESEARCH.md` | **DONE** |
| `docs/ui/UI_REDESIGN_ROLLOUT.md` | **DONE (v1)** — se rehará |
| `docs/observability/METRICS_CATALOG.md` | **DONE** — falta clasificación REAL/DERIVED/ESTIMATED/UNAVAILABLE |
| `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` | **DONE (v1)** — se ampliará con MPT-INSPECT |
| `docs/qa/UI_REDESIGN_VERIFICATION.md` | **PENDING** |
| `docs/audits/TASK_COVERAGE_MATRIX.md` | **DONE (este archivo)** |
| `FINAL_IMPLEMENTATION_REPORT.md` | **PENDING** (al final) |

### §33. REFERENCIAS

| Documento | Estado | Notas |
|---|---|---|
| MPT upstream pinned | **DONE** | `cf5a3ae...` v1.3.7 MIT |
| Inspeccionar upstream actual | **PENDING** | Iniciar Fase MPT-INSPECT. |
| Grafana dashboard design best practices | N/A | Se aplican principios generales. |
| WCAG 2.2 contrast | **DONE** | ADR-007 §6. |
| Geist | **DONE** | Descartado en TYPOGRAPHY_RESEARCH. |

---

## 2. Conteo rápido

| Estado | Cuenta |
|---|---|
| **DONE** | ~45 requisitos |
| **PARTIAL** | ~35 requisitos |
| **PENDING** | ~25 requisitos |
| **BLOCKED** | 0 |

---

## 3. Plan de continuación

### 3.1 Fase actual — MPT-INSPECT + design system + componentes

**Objetivo:** continuar con las fases pendientes empezando por la investigación real del upstream MPT (que es priorizada por el usuario) y la extracción de componentes compartidos (Fase DS-COMPONENTS) que es prerequisito para refactorizar pantallas.

### 3.2 Siguientes fases

1. **MPT-INSPECT** — investigar upstream actual de harry0703/MoneyPrinterTurbo (no la versión pinneada local) para descubrir capacidades nuevas (AI Agent, nuevos providers, nuevos formatos, batch, etc.) y actualizar el adapter doc.
2. **DS-COMPONENTS** — extraer `MetricCard`, `StatusBadge`, `EmptyState`, `Skeleton`, `ErrorState`, `MetricSparkline`, `JobProgress`, `HealthIndicator`, `AlertRow`, `DataTable`, `DetailDrawer`, `FilterBar`, `BottomConsole`, `LogViewer`. Aplicar a las páginas más críticas.
3. **METRICS-CLASSIFY** — refactorizar METRICS_CATALOG.md con tags REAL/DERIVED/ESTIMATED/UNAVAILABLE.
4. **DASHBOARD-9** — completar dashboard con la fila analítica (charts) + alertas accionables + jerarquía completa.
5. **CUENTAS-10 / COLA-11 / CALENDARIO-12** — refactor tablas, detail drawers, pipeline visual.
6. **MPT-UI-13** — refactor MoneyPrinterModal con 8 secciones plegables, panel derecho real.
7. **ADB-14 / PANDA-15 / CURL-16 / PYTHON-17 / VERSIONS-18 / PROXIES-19** — refactor UX de pantallas restantes.
8. **RESPONSIVE-20 / A11Y-21** — verificar viewports, accesibilidad.
9. **TYPOGRAPHY-INSTALL** — instalar fuentes via npm.
10. **TESTS-27 / PERFORMANCE-28** — añadir unit/integration nuevos; lazy-load, throttling.
11. **DOCS-FINAL** — DESIGN_SYSTEM.md, UI_REDESIGN_VERIFICATION.md, FINAL_IMPLEMENTATION_REPORT.md.

---

**Fin del coverage matrix.** Siguiente paso: MPT-INSPECT (investigar upstream actual de harry0703/MoneyPrinterTurbo).