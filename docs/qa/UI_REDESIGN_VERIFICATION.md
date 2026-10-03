# UI Redesign Verification — TASK_UI_UX_REAL_CONTROL_HUB_V1

**Fecha:** 2026-10-03
**Versión:** 2.0 (cierre)
**Branch:** `feat/ui-ops-control-hub-v2`
**Baseline:** `b6995e5`

> La v1.0 de este documento reflejaba un estado intermedio (10 commits). Esta
> versión recoge el estado **verificado** tras las 4 fases finales: OpenAPI
> generado, data layer explícito, lazy-load/vendor chunks, responsive real y
> E2E + capturas con navegador.

---

## 1. Cómo se verifica cada afirmación

| Capa | Comando | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | exit 0 |
| Unit/integración | `npx vitest run` | **199/199** |
| Unit Python | `platform\.venv\Scripts\python.exe -m pytest platform/tests` | **64/64** |
| Build | `npx vite build` | exit 0 |
| E2E navegador | `npx playwright test` | **61/61** (4 viewports) |
| Visual | `npx playwright test e2e/visual.spec.ts` | 12 capturas en `docs/evidence/ui/` |

Los E2E corren contra `server/app.ts` real sirviendo `dist/` real, con BD
sembrada y un stub de Flask que devuelve `[]`/`503` explícito. El stub no
falsea respuestas: los tests ejercitan los estados de vacío y error de verdad.
Ver `e2e/README.md`.

Evidencia en disco de la última ejecución (13:51–13:56):

```
e2e/.artifacts/.last-run.json  {"status":"passed","failedTests":[]}
e2e/.artifacts/report.json    expected 61 · unexpected 0 · flaky 0 · skipped 39
npx playwright test            61 passed · 39 skipped · 0 failed
docs/evidence/ui/*.png         12 capturas regeneradas
```

Comprobación de tokens (el defecto del §4):

```
tokens var(--*) usados en src/** ......... 20
tokens definidos en src/index.css ....... 46
tokens indefinidos ...................... 0
```

---

## 2. Evidencia por requisito

### §2 Backup — ✅
`C:\Users\haxth3\control-hub-backups\20261003-100319\`
(`BACKUP_MANIFEST.md`, `control-hub-before-ui.bundle`, `working-tree.tar`,
branch `backup/pre-ui-redesign-20261003-100319`). **Intacto**: no se ha escrito
en esa ruta desde su creación.

### §4/§9 Semántica de color — ✅ (corregido)
`--color-brand: #3B82F6` azul accent · `--color-ok: #22C55E` ·
`--color-warn: #F59E0B` · `--color-danger: #EF4444` · `--color-ai: #A855F7`.
`scripting`/`generating` usan `kind: 'ai'` (púrpura = procesamiento).
Verificable en las capturas: `README/PUBLISHING` azul, `COMPLETED` verde,
`FAILED` rojo, `GENERATING` púrpura.

### §4 Tokens rotos — ✅ (corregido)
La app referenciaba `var(--color-border)`, `var(--color-surface-0/1)` y
`var(--color-text-dim)` sin que existieran: esos valores caen a `inherit` y los
bordes/fondos se aplanan. Definidos en `src/index.css`.

### §5 Tipografía — ✅
Inter Variable + JetBrains Mono vía `@fontsource`. Visible en las capturas.

### §6 Métricas — ✅
`METRIC_CATALOG.md` con fuente/query/fórmula/fallback/estado-sin-datos por
métrica. `_metricClass.ts` clasifica REAL/DERIVED/ESTIMATED/UNAVAILABLE.

### §7 Charts — ✅
`LineChart`/`BarChart`/`HeatMap`/`ChartCard` en SVG inline. Cada `ChartCard`
imprime su fuente real (`queue[].scheduled_ts`, `queue[].status`,
`queue[].scheduled_ts`). Sin datos → texto explicativo, no línea en cero.

### §9 Dashboard — ✅
Captura `dashboard-1920x1080-after.png`: fila KPI → alertas operacionales
(CRIT/MED con acción) → próximas publicaciones 24 h → fila analítica →
cuerpo de 3 columnas. Cero literales inventados (E2E #10 lo verifica).

### §11 Cola — ✅
Pipeline 11 estados → 6 buckets con badges de color correctos.

### §13 MPT — ✅
Pin local `cf5a3a7` v1.3.7 (MIT); upstream inspeccionado `fafec0fb` v1.3.8.
Estado real "MPT offline" propagado a la alerta CRIT. E2E #7 verifica que no
hay credenciales MPT en el DOM.

### §16 cURL API — ✅ (implementado, no simulado)
`GET /api/openapi.json` genera el contrato recorriendo `app._router.stack` de
Express y los esquemas Zod reales con `z.toJSONSchema`. Verificado por HTTP:

```
OPENAPI: 3.1.0 v0.1.0 · 47 paths · 53 operaciones
POST /api/accounts requestBody:
  {"type":"object","properties":{"username":{"type":"string","minLength":1,"maxLength":64},
   "password":{...},"device_serial":{...},"proxy_id":{...},"warmup_day":{...}},
   "required":["username","password","device_serial"],"additionalProperties":false}
POST /api/accounts security: [{"sessionCookie":[]},{"csrfHeader":[]}]
POST /api/queue/{id}/approve x-panel-role: admin
```

El explorers (captura `api-explorer-1440x900-after.png`) muestra esas 53
operaciones con sus filtros y conteos reales.

### §18 Versiones — ✅
`/api/stack` expone `git_sha`, `package_version`, `mpt_pinned_sha`,
`mpt_pinned_version` leídos del entorno real.

### §20 Responsive — ✅
- Grid con `minmax(min(Npx, 100%), 1fr)`: sin desborde a 390 px (E2E lo mide).
- KPIs: scroll horizontal con `scroll-snap` en móvil.
- Sidebar → overlay con hamburguesa por debajo de 1024 px, derivado de
  `matchMedia`. Landmarks separados: "Navegación principal" y
  "Navegación técnica".
- Consola plegada a su cabecera (28 px) en layout estrecho: oculta el log pero
  **el toggle sigue siendo alcanzable** (un `height: 0` la haría inaccesible
  — corregido tras detectarlo en el E2E).
- Capturas: `login-390x844`, `dashboard-1440x900`, `dashboard-1920x1080`,
  `dashboard-1366x768`.

### §23 Data layer — ✅
`src/data/{dto,mappers,resource}.ts`. 43 tests. Regla verificada por test: un
dato ausente es `null` → la UI muestra `—`/`Sin datos`; nunca 0.

### §28 Performance — ✅ (medido)
`index-*.js` **947.75 kB → 594.22 kB** (gzip **235.61 → 154.02 kB, −34.6 %**).
9 superficies diferidas (183.32 kB) + vendor chunks (`motion`, `react`,
`icons`). Detalle en `docs/ui/PERFORMANCE_BUNDLE_BEFORE_AFTER.md`.

### §24 Seguridad — ✅ (sin regresión)
Las etiquetas de introspección (`__chRequiresAuth`, `__chMountPrefix`…) no
alteran el orden ni el comportamiento del middleware: `appGuarded` envuelve
cada handler en un wrapper por montaje. Tests RBAC/CSRF de `test/rbac.test.ts`
siguen verdes.

---

## 3. Defectos encontrados y corregidos durante la verificación

| # | Defecto | Cómo apareció | Corrección |
|---|---|---|---|
| 1 | Tokens CSS inexistentes (`--color-border`, `--color-surface-0/1`, `--color-text-dim`) referenciados por ~60 call sites | Inspección estática | Alias definidos en `@theme` |
| 2 | Landmark `navigation` sin nombre y grupos Dev/Material fuera del `<nav>` | E2E: `getByRole('navigation', {name})` no encontrado | `<nav aria-label>` en ambos grupos |
| 3 | Consola a `height: 0` en móvil dejaba su toggle inalcanzable | E2E móvil: el botón no era visible | Plegada a la cabecera (28 px), log oculto |
| 4 | Bundle único de 948 kB | `vite build` | Lazy-load + vendor chunks |
| 5 | `/videos/api/auth/logout` y `/videos/panda` en el OpenAPI por mutar un middleware compartido | Test unitario del OpenAPI | `appGuarded` clona el handler por montaje |

---

## 4. Pendientes que quedan (no bloqueantes)

| Ítem | Por qué |
|---|---|
| Bump MPT 1.3.7 → 1.3.8 | Tarea con plan de pruebas propio; el pin actual es estable y auditable |
| Buckets históricos p50/p95, throughput, coste | El backend no los persiste; añadir el contrato es otro cambio |
| Virtualización de la consola | El buffer ya está acotado (64 Ki en servidor) |
| Tests de componente con DOM | El runner de vitest es `environment: "node"`; añadir jsdom es un cambio de tooling |
| E2E contra la plataforma real | Requiere Flask + ADB + MPT levantados (`PW_USE_REAL_BACKEND`) |

Ninguno implica datos inventados ni una función hueca en pantalla.

---

## 5. Criterios de aceptación (§29)

Los 33 checkboxes de §29 están cubiertos. Los que dependían de un navegador
(§27.4, §27.5, §20) están ahora **verificados con Chromium real**, no
declarados.
