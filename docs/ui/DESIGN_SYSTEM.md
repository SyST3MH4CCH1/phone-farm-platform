# Phone Farm Control Hub — Design System

**Fecha:** 2026-10-03
**Versión:** 1.0
**Vigente:** `feat/ui-ops-control-hub-v2` (post-rediseño TASK_UI_UX_REAL_CONTROL_HUB_V1)
**Decisión:** `ADR-007-DARK-OPERATIONS-UI.md`

---

## 0. Filosofía

Sistema dark-only (no `.theme-light`), denso, técnico, "centro de operaciones". Lenguaje
visual coherente con Linear / Hermes-HUD / Mission-Control. Sin emojis decorativos,
sin gradientes saturados, sin mockups de "AI neon". **El color codifica estado, no
decoración.** **Icono + texto acompañan al color** (cumple WCAG 2.2 AA: nunca
depender solo de color — TASK §4.4 / §21).

---

## 1. Tokens

### 1.1 Color

`src/index.css` declara los tokens en el bloque `@theme` de Tailwind 4:

| Token | Hex | Uso |
|---|---|---|
| `--color-canvas` | `#0A0A0B` | Fondo base (más profundo). |
| `--color-surface` | `#111315` | Cards, paneles, modales. |
| `--color-surface-1` | `#14171A` | Filas alternadas. |
| `--color-surface-2` | `#1A1E22` | Header de cards, hover sutil. |
| `--color-surface-3` | `#1F262E` | Headers sticky, popovers. |
| `--color-surface-4` | `#252C36` | Hover state de filas. |
| `--color-line` | `#262A30` | Bordes, separadores. |
| `--color-brand` | `#00FF88` | **Matrix Green** — accent principal. |
| `--color-ok` | `#22C55E` | Success / active / published. |
| `--color-warn` | `#FFB800` | Warning / awaiting. |
| `--color-danger` | `#FF3B5C` | Failed / offline. |
| `--color-info` | `#38BDF8` | Running / publishing. |
| `--color-text` | `#E5E5E5` | Texto principal (~16:1 sobre canvas). |
| `--color-muted` | `#9CA1A8` | Texto secundario (~7.5:1). |
| `--color-muted-2` | `#7E8590` | Metadata, captions (~5.4:1, WCAG AA). |
| `--color-input-bg` | `#1A1C1E` | Inputs. |
| `--color-input-border` | `#2A2C30` | Bordes de inputs. |

> **Nota**: la TASK §4.3 sugiere `--bg-0/1`, `--surface-1/2/3`, `--text-1/2/3`,
> `--primary/success/warning/danger/purple/cyan`. El design system preexistente ya
> usa una escala equivalente (`canvas / surface{1..4}`) y la paleta semántica
> (`brand / ok / warn / danger / info`). No se hace cambio destructivo; los
> adicionales (purple para TTS, nuevos buckets) se mapean vía clases cuando
> aparecen en pantallas específicas. Ver ADR-007 §2.

### 1.2 Tipografía

`TYPOGRAPHY_RESEARCH.md` detalla la decisión. Estado final:

- **Sans:** `Inter Variable` (paquete `@fontsource-variable/inter@5.2.5`) con
  fallback `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
  Características: `cv11` (letra `i` con punto), `ss01` (cifras slashed opcional),
  `tnum` (cifras tabulares para KPIs).
- **Mono:** `JetBrains Mono` (paquete `@fontsource/jetbrains-mono@5.2.5`)
  weights 400/500/700 con fallback `'Cascadia Code', 'Fira Code', monospace`.
  Características: `zero` (cero con barra), `ss02` (desambiguación `0/O`).

```text
Page title       22-24 / 700
Section title    14-16 / 600
Card label       11-12 / 500-600 uppercase tracking-wider
KPI value        26-30 / 700 tabular-nums
Body             12-13 / 400-500
Table            12  / 400-500 mono
Metadata         11  / 400-500 muted-2
Console / code   11-12 / 400-500 mono
```

### 1.3 Espaciado y radios

- Espaciado Tailwind 4 (default): `0, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24 px`.
- Radios: `4px` (chips/badges), `8px` (cards), `12px` (modales grandes).

### 1.4 Estados semánticos (chips / pills / badges)

| Token | Uso | A11y |
|---|---|---|
| `ok` | active / online / published / completado | texto + ícono check + color. |
| `warn` | awaiting / degraded / revision | texto + ícono alert + color. |
| `danger` | failed / offline / rejected | texto + ícono alert + color. |
| `info` | running / publishing | texto + ícono info + color. |
| `paused` | queued / paused | texto + ícono pause + color muted. |
| `running` | en curso | texto + ícono play + brand color + pulse. |
| `leased` | lease activo | texto + ícono lock + info. |
| `degraded` | salud degradada | texto + ícono trending + warn. |
| `neutral` | sin valor | color muted. |
| `brand` | brand / feature flag | brand color. |

Componente React: `src/components/design/StatusBadge.tsx`. Respeta
`prefers-reduced-motion: reduce` para el pulso.

---

## 2. Componentes compartidos (TASK §22)

`src/components/design/`:

| Componente | Propósito | Tests |
|---|---|---|
| `StatusBadge` | Badge semántico con dot, pulse (gated por reduced motion). | — |
| `CollapsibleSection` | Sección plegable accesible (`aria-expanded` + `aria-controls`, header `<button>`). | — |
| `LineChart` | Serie temporal 1–4 series, crosshair, tooltip, empty state. | `chart-logic.test.ts` (lógica) |
| `BarChart` | Comparación con labels y valores. | `chart-logic.test.ts` (lógica) |
| `HeatMap` | Actividad por día, 4 pasos de intensidad. | `chart-logic.test.ts` (lógica) |
| `ChartCard` | Contenedor con `title` + `source` + `emptyReason`. | — |
| `JobProgress._mapping` | Tabla central 11 estados + helpers. | `design-system.test.ts` |
| `_formatters` | formatPercent/Bytes/Latency/RelativeTime/Timestamp. | `design-system.test.ts` |
| `_metricClass` | Clasificador REAL/DERIVED/UNAVAILABLE por metric_key. | `design-system.test.ts` |
| `_chartLogic` | Paleta, segmentos sin interpolar, yRange, heatIntensity. | `chart-logic.test.ts` |
| `_mptCapabilities` | 24 capacidades MPT con decisión NOW/LATER/REJECT. | `design-system.test.ts` |
| `_redact` | Redacción de secretos en consola. | `redact-secrets.test.ts` |

Cada componente tiene como mínimo `role=` apropiado, `aria-label` cuando es
botón-only-icono, y clases CSS que respetan `prefers-reduced-motion`.

---

## 3. Charts (TASK §7)

**No se introducen Recharts/Chart.js**. Implementación propia, SVG inline,
cero dependencias. La lógica vive en `src/components/design/_chartLogic.ts`
(pura y testeada); el render en `src/components/design/Charts.tsx`.

| Componente | Uso | Estado vacío |
|---|---|---|
| `LineChart` | Series temporales (CPU/RAM a lo largo del tiempo). 1–4 series. | "Sin datos suficientes para el periodo" si ninguna serie tiene ≥2 puntos válidos. |
| `BarChart` | Comparación (publicaciones por día, jobs por bucket). | "Sin datos para el periodo" si `data` está vacío. |
| `HeatMap` | Actividad por día (calendario, 13 semanas por defecto). | "Sin actividad registrada" si `cells` está vacío. |
| `ChartCard` | Contenedor con título, `source` (origen del dato) y `emptyReason`. | Renderiza `emptyReason` en vez del chart. |

### 3.1 Reglas aplicadas (TASK §7)

- **Sin 3D**, sin relleno degradado, sin animación de entrada.
- **Paleta de 4 colores**, determinista y cíclica (`colorForSeries`):
  `info` (azul) → `brand` (verde) → `warn` (ámbar) → `danger` (rojo).
- **Unidades explícitas** en el eje Y (`formatPercent` → `%`, latencia → `ms`).
- **Tooltip** al hover **y** al focus. Cada punto/barra/celda es
  `tabIndex={0}` + `role="button"` + `aria-label` con el valor exacto, para
  que un lector de pantalla o teclado obtenga el dato.
- **`role="img"` + `aria-label`** en el `<svg>` con un resumen legible de
  todas las series.
- **Loading / empty / error explícitos**: nunca un chart vacío fingiendo datos.

### 3.2 Invariante crítica: no interpolar huecos

`toSegmentIndices(points)` parte una serie temporal en segmentos continuos.
Un hueco (`null` / `NaN`) **abre la línea**: no se dibuja el puente entre el
último punto válido y el siguiente. Esto convierte en invariante testeada la
regla del TASK §0 de no fabricar datos.

```ts
toSegments([1, 2, null, 4, 5])   // → [[1, 2], [4, 5]]  (2 segmentos, NO conecta 2 con 4)
toSegments([1, null, 3, 4])      // → [[3, 4]]          (segmentos de 1 punto no se emiten)
isLineDrawable([5])              // → false             (no se puede dibujar una línea)
```

### 3.3 Escala del heatmap

`heatIntensity(value, max)` devuelve 0–4. El nivel 0 es `var(--color-surface-2)`
(celda vacía); los niveles 1–4 son `rgba(0,255,136, 0.25|0.45|0.70|0.95)`.
El valor `max` siempre cae en nivel 4.

---

## 4. Acceso directo a `docs/`

| Documento | Tema |
|---|---|
| `docs/adr/ADR-007-DARK-OPERATIONS-UI.md` | Decisión dark ops. |
| `docs/ui/TYPOGRAPHY_RESEARCH.md` | Decisión tipográfica. |
| `docs/observability/METRICS_CATALOG.md` | Catálogo de métricas con fórmula, fuente, unidad, ventana. |
| `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` | Adapter MPT pin + mapping + secretos. |
| `docs/integrations/MONEYPRINTERTURBO_UPSTREAM_INSPECTION.md` | v1.3.7 vs v1.3.8 upstream. |
| `docs/audits/UI_REDESIGN_REALITY_AUDIT.md` | Inventario técnico + matriz REAL/PARCIAL/MOCK. |
| `docs/audits/TASK_COVERAGE_MATRIX.md` | Estado DONE/PARTIAL/PENDING por requisito. |
| `docs/security/DEVTOOLS-SURFACE-AND-FLAGS.md` | ADB allowlist + flags ENABLE_DEV_*. |
| `docs/ui/UI_REDESIGN_ROLLOUT.md` | Resumen de rollout + before/after. |
| `docs/qa/UI_REDESIGN_VERIFICATION.md` | Verificación y resultados. |

---

## 5. Reglas de uso (estilo)

1. **Nunca** muestres cifras inventadas. Si no hay dato → em-dash `—`.
2. **Nunca** uses `Math.random()` en datos por defecto.
3. **Nunca** filtres secretos en consola (usar `redactSecrets`).
4. **Nunca** pongas un botón funcional sin endpoint real.
5. **Nunca** llames "live" a un screenshot estático.
6. **Nunca** simules entornos (Staging/Production/Rollback ficticios).
7. **Nunca** uses shell ADB arbitrario.
8. **Nunca** expongas API keys LLM/TTS en la UI.
9. **Nunca** llames a MPT directamente desde el frontend. Solo a `/api/*` del panel.
10. **Nunca** apruebes un cross-post sin `idempotency_key` (TASK §30).
12. **Siempre** respeta `prefers-reduced-motion: reduce` (cumple §21).
13. **Siempre** etiqueta icon-only buttons con `aria-label`.
14. **Siempre** acompaña el color con icono + texto (WCAG §21).
15. **Siempre** tokeniza: nada de `#FFFFFF` hardcoded — usa `--color-*`.

---

## 6. Roadmap de design system

| Estado | Item |
|---|---|
| **NOW** | Este diseño. |
| **LATER** | Tokens TASK §4.3 explícitos (`--bg-0/1`, `--surface-1/2/3`, `--text-1/2/3`) sin destruir los actuales. |
| **LATER** | `DataTable` y `DetailDrawer` extraídos como compartidos (hoy inline en `AccountsPanel`/`QueuePanel`). |
| **LATER** | `CodeViewer` como `design/CodeViewer.tsx` (hoy `components/CodeViewerModal.tsx`). |
| **LATER** | Tokens para alturas (`--control-sm/md/lg`), table density (`--row-tight/regular/loose`), chart palette. |

---

**Fin del design system.** Cada componente nuevo en `src/components/design/` debe
añadir test unitario en `test/design-system.test.ts` y respetar las 15 reglas de
§5.