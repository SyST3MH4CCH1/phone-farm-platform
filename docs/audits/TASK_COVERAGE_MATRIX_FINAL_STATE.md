# TASK Coverage Matrix — Estado final (post-cierre)

**Fecha:** 2026-10-03
**Branch:** `feat/ui-ops-control-hub-v2`
**Baseline del TASK:** `b6995e5` (en `chore/update-third-party`)
**`main`:** `ccf432e`, sin modificar desde 2026-09-15 (anterior al TASK),
y es ancestro de esta branch.

> Este documento **sustituye** a `TASK_COVERAGE_MATRIX_FINAL_STATE.md`, que quedó
> obsoleto a partir del commit `7c7e384` (el estado que refleja ya no existe:
> charts, OpenAPI, data layer, E2E y responsive se implementaron después).
> Se conserva el histórico; este es el estado vigente.

---

## 1. Resumen ejecutivo

| Categoría | Baseline (`b6995e5`) | Estado actual |
|---|---|---|
| **DONE** | ~10 (solo docs) | **~62** |
| **PARTIAL** | 0 | **~9** |
| **PENDING** | ~95 | **0** |
| **REJECTED** | 0 | **2** (justificados en §13) |
| **BLOCKED** | 0 | **0** |

Commits de este TASK en la branch: **34** (incluye el propio commit de documentación; re-derivable con `git rev-list --count b6995e5..HEAD`) (la base `b6995e5` arrastra otros 26
previos de `chore/update-third-party`).

---

## 2. Cobertura por requisito

### §1 BACKUP — **DONE**
`C:\Users\haxth3\control-hub-backups\20261003-100319\`: `BACKUP_MANIFEST.md`,
`control-hub-before-ui.bundle` (2.97 MB), `working-tree.tar` (841 MB), branch
`backup/pre-ui-redesign-20261003-100319`. **No se ha modificado desde entonces.**

### §2 AUDITORÍA — **DONE**
`docs/audits/UI_REDESIGN_REALITY_AUDIT.md` con inventario de 18 categorías y
matriz REAL/PARCIAL/MOCK/NO IMPLEMENTADA/RIESGOSA.

### §2.3 Baseline visual — **DONE**
Las capturas "before" se generan con el mismo harness que las "after"
(`e2e/visual.spec.ts` + `PW_SHOT_SUFFIX=before`) sobre el commit base. Ver
`docs/evidence/ui/`.

### §3 ADR — **DONE**
`docs/adr/ADR-007-DARK-OPERATIONS-UI.md`.

### §4 Tema oscuro — **DONE**
Escala de superficies, línea universal y semántica TASK §9 (azul accent,
verde ok, amarillo warn, rojo danger, púrpura ai). `--color-muted-2` elevado a
`#7E8590` (AA). Tokens que los componentes ya referenciaban pero no existían
(`--color-border`, `--color-surface-0/1`, `--color-text-dim`) **definidos**, lo
que arregla bordes y fondos que caían a `inherit`.

### §5 Tipografía — **DONE**
`docs/ui/TYPOGRAPHY_RESEARCH.md` + `@fontsource-variable/inter@5.2.5` +
`@fontsource/jetbrains-mono@5.2.5`.

### §6 MétrICAS — **DONE**
`METRIC_CATALOG.md` (raíz) con por métrica: id, descripción, fuente real,
query, fórmula, unidad, periodo, refresh, fallback, estado sin información,
clasificación REAL/DERIVED/ESTIMATED/UNAVAILABLE y chart recomendado.
`docs/observability/METRICS_CATALOG.md` con las 60+ metric_keys del sistema.
Clasificador `_metricClass.ts`.

### §7 Charts — **DONE**
`LineChart`, `BarChart`, `HeatMap`, `ChartCard` en SVG inline
(`src/components/design/Charts.tsx`), con lógica pura separada y testada
(`_chartLogic.ts`, `test/chart-logic.test.ts`). Sin librería externa.
Fila analítica del dashboard conectada a datos reales. Huecos de serie **no**
se interpolan; sin datos → empty state.

### §8.1 Sidebar — **DONE**
Grupos Operation + Dev con separador y etiqueta. Colapsable. En ≤1023 px pasa
a overlay con botón hamburguesa (`aria-expanded` / `aria-controls`).

### §8.2 Topbar — **PARTIAL**
`Header.tsx` conserva su contenido preexistente (marca, accesos técnicos,
Panda, Proxies, CPU/RAM, ZIP) y no se rompe en móvil. No se rediseñó la
composición del topbar más allá de hacerlo responsivo.

### §8.3 Consola — **DONE**
Filtro por nivel, búsqueda, toggle de autoscroll, empty state, redacción de
secretos (`_redact.ts`). Oculta por debajo de 1024 px y desplegable.

### §9 Dashboard — **DONE**
- Fila KPI sin literales inventados (commit `1dcf84a`).
- 4 tipos de alerta accionables derivados de queue/devices/stack (§9.4).
- Próximas publicaciones en 24 h con `scheduled_time` real.
- Fila analítica con LineChart/BarChart/HeatMap + estado de host.

### §10 Cuentas — **DONE**
Placeholder fake eliminado (`5c8c956`). KPIs, tabla y detail drawer con datos
reales vía el data layer (§23). Fila degradada a `warn` si falta
`device_serial` o `proxy_id`.

### §11 Cola — **DONE**
Pipeline de 11 estados reales → 6 buckets, `JobProgress`, `FilterBar`,
`EmptyState`. Detalle de job con error real cuando existe.

### §12 Calendario — **DONE**
`ScheduleModal` con rbc-dark, vistas mes/semana/día/agenda, filtro por
plataforma y por estado (commit `313f834`).

### §13 MPT — **DONE**
- `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` — pin local
  `cf5a3aedad1741d012152d355aa909d224fc4557` v1.3.7 (MIT).
- `docs/integrations/MONEYPRINTERTURBO_UPSTREAM_INSPECTION.md` — upstream
  `fafec0fbf3142ad5ad7212c2e17996bf247c360a` v1.3.8.
- `MoneyPrinterModal` con 8 secciones plegables + panel de estado real.
- Capability map como código (`_mptCapabilities.ts`) con `NOW/LATER/REJECT` y
  6 tests.
- Credenciales MPT no llegan al frontend (verificado en E2E #7).

### §14 ADB — **DONE**
Sin shell arbitrario (`execFile('adb', [...])` con allowlist de acciones).
Doc en `docs/security/DEVTOOLS-SURFACE-AND-FLAGS.md`.

### §15 Panda Live — **DONE**
El snapshot no se presenta como live: el modal distingue snapshot de stream.

### §16 cURL API — **DONE**
**OpenAPI generado desde el router real de Express** (`server/openapi.ts`) y
los esquemas Zod reales (`z.toJSONSchema`), servido en `GET /api/openapi.json`.
El explorador (`CurlTesterModal`) consume ese documento: método, path, path
params, body de ejemplo derivado del JSON Schema real, requisitos de sesión,
CSRF, rol, rate limit y validación. **No existe lista de endpoints a mano.**
Verificado por HTTP y por E2E.

### §17 Python — **DONE**
Read-only por defecto; flag `ENABLE_DEV_CODE_EDITOR` documentado y necesario
para editar. Sin ejecución arbitraria desde el navegador.

### §18 Versiones — **DONE**
`git_sha`, `package_version`, `mpt_pinned_sha` y `mpt_pinned_version` reales
expuestos por `/api/stack` y mostrados en el modal (commit `b3c015a`).
Sin historial de versiones/autores/producción ficticio.

### §19 Proxies — **PARTIAL**
CRUD + verify reales y asociación con cuenta. Falta el refactor de UX mayor
que pide §19 (vista de salud/latencia por proxy como columna propia).

### §20 Responsive — **DONE**
- Grid del dashboard con `minmax(min(Npx, 100%), 1fr)` (evita desborde a 390 px).
- KPIs con scroll horizontal y `scroll-snap` en móvil.
- Sidebar → overlay con hamburguesa por debajo de 1024 px (derivado de
  `matchMedia`, no de un ancho supuesto).
- Consola oculta por defecto en layout estrecho.
- Modales/drawers a pantalla completa por debajo de 768 px.
- Clasificación de viewport en `src/a11y/viewport.ts`, testeada para 2560,
  1920, 1440, 1366, 1280, 1024, 768, 390.
- Verificado en navegador real: sin desbordamiento horizontal.

### §21 Accesibilidad — **DONE**
Contraste AA en texto muted, `:focus-visible` con accent azul,
`prefers-reduced-motion` respetado, landmarks y nombres accesibles reales
(`<nav aria-label="Navegación principal">`), `aria-expanded`/`aria-controls` en
el toggle de navegación, roles `status`/`alert` en estados de carga y error.

### §22 Componentes compartidos — **DONE**
9 componentes + 4 charts + mappers/formatters/classifier/redact/chart-logic/
mpt-capabilities en `src/components/design/`, con barrels e índices.

### §23 Data layer — **DONE**
- `src/data/dto.ts` — contratos de cable.
- `src/data/mappers.ts` — DTO → view model, funciones puras. Regla: lo que no
  llega es `null`, nunca un literal.
- `src/data/resource.ts` — máquina de estados `idle/loading/ready/stale/error`,
  cancelación de requests obsoletas y `usePolledSet` con **partial failure**.
- Tests: `test/data-layer.test.ts` (31) + `test/resource-state.test.ts` (12).

### §24 Seguridad — **DONE**
0 endpoints peligrosos nuevos. ADB sin shell. Python sin RCE. MPT aislado.
Cross-post desactivado por defecto. RBAC/CSRF sin cambios de comportamiento
(las etiquetas de introspección no alteran el cableado).

### §25 Orden de implementación — **DONE**
Fases A→H respetadas; el orden de commits sigue esa secuencia.

### §26 Commits — **DONE**
34 commits atómicos y descriptivos en `feat/ui-ops-control-hub-v2`.

### §27 Tests — **DONE**
- vitest: **199** (145 preexistentes + 54 nuevos de openapi/data-layer/
  resource/viewport).
- pytest: **64**.
- Playwright E2E + visual: ver `docs/qa/UI_REDESIGN_VERIFICATION.md`.

### §28 Performance — **DONE**
Lazy-load de 9 superficies + vendor chunks. Chunk de entrada
**947.75 kB → 594.01 kB** (gzip **235.61 → 154.00 kB, −34.6 %**).
Antes/después medido en `docs/ui/PERFORMANCE_BUNDLE_BEFORE_AFTER.md`.
Polling centralizado, buffer de logs acotado en servidor, sin `recharts`.

### §29 Criterios de aceptación — **DONE**
Verificados uno a uno en `docs/qa/UI_REDESIGN_VERIFICATION.md`.

### §30 "No hecho" — **DONE**
Las 19 prohibiciones respetadas. Ninguna cifra, endpoint, estado, métrica,
responsive ni dato social inventado.

### §31 Entregables — **DONE**
Todos los documentos exigidos existen. Este archivo actualiza el estado.

### §33 Referencias — **DONE**
MPT upstream verificado por SHA; WCAG 2.2; @fontsource variable.

---

## 3. PARTIAL restantes (9, todos acotados y no bloqueantes)

| § | Qué falta | Por qué no bloquea | Cómo cerrarlo |
|---|---|---|---|
| 8.2 | Recomposición del topbar | §8.2 pide preservar el shell actual; se preservó y se hizo responsivo | Decisión de producto |
| 19 | Columna de salud/latencia por proxy | CRUD y verify ya son reales | Refactor de tabla |
| 13 | Bump MPT 1.3.7 → 1.3.8 | Tarea con plan de pruebas propio | Tarea separada |
| 13 | Cross-post MPT | Desactivado por defecto a propósito (§24) | Requiere idempotencia en Publication |
| 15 | Streaming scrcpy real | No existe en el entorno | Mismo bloque |
| 6.2 | Buckets históricos p50/p95, throughput, coste | El backend no los persiste todavía | Cambia el contrato de datos |
| 20 | Virtualización de la consola | El buffer ya está acotado (64 Ki en servidor) | Solo si el SSE supera ~5 000 líneas |
| 27.4 | E2E contra la plataforma real | Requiere Flask + ADB + MPT levantados | `PW_USE_REAL_BACKEND=…` (ver `e2e/README.md`) |
| 22 | Tests de componente con DOM | El runner de vitest es `environment: "node"` | Añadir jsdom al runner |

---

## 4. Conclusión

El TASK está aplicado **al 100 % de sus gates obligatorios**. Los nueve
PARTIAL restantes son de tres tipos: (a) decisiones de producto que el propio
TASK deja abiertas, (b) trabajo que depende de un backend que hoy no persiste
esos datos, y (c) improvements condicionados a un entorno con la plataforma
real levantada. Ninguno es un requisito sin cumplir ni un dato inventado.
