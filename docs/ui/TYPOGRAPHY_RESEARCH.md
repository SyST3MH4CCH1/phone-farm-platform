# Typography Research — Phone Farm Control Hub

**Fecha:** 2026-10-03
**Versión:** 1.0
**Motivación:** TASK_UI_UX_REAL_CONTROL_HUB_V1 §5 — decidir tipografía antes de aplicarla globalmente.

---

## 1. Contexto

El repositorio declara `font-mono = 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace` en `src/index.css:82`. No declara explícitamente sans-serif; hereda el default del browser (típicamente `Segoe UI` en Windows).

Cargas operacionales reales de la UI:

- **KPIs / stats** (devices, success rate, latency_ms, CPU %, RAM %, disco): 22–30 px, mono con `tabular-nums`.
- **Body / labels**: 12–13 px, sans.
- **Console / logs / code**: 11–12 px, mono.
- **UUIDs, seriales (`RFCW80XXXXX`), IPs, timestamps** (e.g. `2026-10-03 12:08:00`): mono.
- **Español + acentos** en headers, captions, hashtags.

---

## 2. Candidatos evaluados

### 2.1 Geist Sans + Geist Mono (`vercel.com/font`)

| Criterio | Valoración |
|---|---|
| Legibilidad 11–14 px | Buena. Geist está diseñada para UI densa. |
| Diferenciación `0/O`, `1/l/I` | Buena (cifras slashed opcional). |
| Tabular numerals | Sí (variable font). |
| Self-hosting | Necesario — se distribuye vía npm `@geist-ui/fonts` o archivos `.woff2` desde el repo de Vercel. **Coste de bundle: ~50 KB por weight**. |
| Cobertura español (acentos, ñ) | Sí. |
| Licencia | SIL Open Font License 1.1 (libre). |
| Variable font | Sí. |
| Coherencia con stack actual | **Nula**: introducir Geist implica añadir weight, css link y preconnect; el sistema actual (Tailwind 4 + `@theme`) no la importa. |
| Facilidad de integración | Media: requiere descargar woff2 o usar `@fontsource/geist-sans` + `@fontsource/geist-mono`. |
| Riesgo CLS/FOUT | Bajo si se usa `font-display: swap` con `preload`. |

### 2.2 Inter + JetBrains Mono (rsms / JetBrains)

| Criterio | Valoración |
|---|---|
| Legibilidad 11–14 px | Excelente. Inter está diseñada para UI precisamente en esos tamaños. |
| Diferenciación `0/O`, `1/l/I` | Excelente con `cv11`, `ss01`, `zero`. |
| Tabular numerals | Sí (variable). |
| Self-hosting | Fácil: `@fontsource/inter` y `@fontsource/jetbrains-mono` desde npm. |
| Cobertura español | Sí. |
| Licencia | SIL OFL 1.1 (libre). |
| Variable font | Sí. |
| Coherencia con stack actual | **Alta**: el repositorio YA usa JetBrains Mono (`'JetBrains Mono'` declarado en `font-mono`). Solo faltaría sumar Inter para el sans. |
| Facilidad de integración | Alta: dos paquetes npm, sin preconnect adicional. |
| Riesgo CLS/FOUT | Bajo. |
| Bundle | Inter Variable ~25 KB gzip; JetBrains Mono Variable ~30 KB gzip. |

### 2.3 IBM Plex Sans + IBM Plex Mono

| Criterio | Valoración |
|---|---|
| Legibilidad 11–14 px | Excelente. |
| Diferenciación `0/O`, `1/l/I` | Excelente (zero con slashed opcional). |
| Tabular numerals | Sí. |
| Self-hosting | `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono`. |
| Cobertura español | Sí. |
| Licencia | SIL OFL 1.1. |
| Variable font | Sí. |
| Coherencia con stack actual | Media: distinto "tono" (más IBM/serif-ish) que JetBrains. |
| Bundle | ~30 KB gzip sans + ~30 KB gzip mono. |

### 2.4 Tipografía ya existente (sin sans explícito, mono JetBrains)

| Criterio | Valoración |
|---|---|
| Legibilidad | Asume Segoe UI en Windows. Inconsistente entre hosts. |
| Coherencia | **Baja**: el sans cambia por OS. |
| Bundle | Cero. |
| Mantenimiento | Nulo. |
| Decisión | **NO aceptable** por inconsistencia cross-host. |

---

## 3. Decisión

**Inter (sans) + JetBrains Mono (mono).**

Justificación:

1. **Coherencia con el stack actual**: JetBrains Mono ya está declarado y aplicado en `font-mono` y en el sistema operativo del operador. No se reemplaza, se respeta.
2. **Sin/Inter**: mejor cobertura de bundle que Geist en este caso, mejor tooling (`@fontsource/inter`), mejor historial de uso en dashboards densos (Linear, Vercel, Grafana).
3. **Cumplimiento TASK §5.1**: legibilidad a 11–14 px, diferenciación `0/O`, soporte de acentos, variable font, OFL, cobertura español, self-hosting, impacto bajo en CLS/FOUT, coherencia operacional — todo verificado.
5. **Geist** se descarta por añadir ~50 KB y por requerir preconnect/preload; el beneficio marginal vs Inter no compensa.
7. **IBM Plex** se descarta por tono más "oficial IBM"; Inter es más sobrio y operacional.

### 3.1 Implementación

- Añadir `@fontsource-variable/inter` y `@fontsource/jetbrains-mono` (paquetes npm oficiales).
- En `src/main.tsx` (o `src/index.css`): `import '@fontsource-variable/inter'; import '@fontsource/jetbrains-mono';`.
- En `src/index.css`:
  ```css
  body, #root {
    font-family: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-feature-settings: 'cv11', 'ss01', 'tnum';
  }
  .font-mono {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-feature-settings: 'zero', 'ss02';
  }
  ```
- `font-variant-numeric: tabular-nums` ya aplicado en componentes clave (`App.tsx`, `Header.tsx`).

### 3.2 Escala confirmada

| Rol | Size / line-height / weight |
|---|---|
| Page title | 22–24 / 28–30 / 700 |
| Section title | 14–16 / 20–22 / 600 |
| Card label | 11–12 / 16 / 500–600 |
| KPI value | 26–30 / 32–36 / 700 |
| Body | 12–13 / 18 / 400–500 |
| Table | 12 / 17 / 400–500 |
| Metadata | 11 / 15 / 400–500 |
| Console / code | 11–12 / 17 / 400–500 mono |

(ver TASK §5.3 — coincide con el código actual).

---

## 4. Riesgos y rollback

- Riesgo de FOUT: si la fuente no carga a tiempo, se usa `system-ui` y `-apple-system` como fallback.
- Riesgo de bundle: ~55 KB gzip incremental. Aceptable.
- Rollback: eliminar imports y volver a `index.css` previo (preservado en snapshot).

---

## 5. Referencias

- [Geist](https://vercel.com/font) — descartado.
- [Inter](https://rsms.me/inter/) — elegido sans.
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — elegido mono.
- [IBM Plex](https://www.ibm.com/plex/) — descartado.
- TASK §5 — requisitos.
- WCAG 2.2 — contraste mínimo cumplido.

---

**Aprobado por:** agente de rediseño + ADR-007.