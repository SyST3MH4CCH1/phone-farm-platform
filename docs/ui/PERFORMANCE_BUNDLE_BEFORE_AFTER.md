# Performance — before/after medido (TASK §28)

Medido con `vite build` (Vite 6.2.3) sobre la branch `feat/ui-ops-control-hub-v2`.
No son estimaciones: son los artefactos que emite el bundler.

## Bundle

| Métrica | Before | After | Δ |
|---|---:|---:|---:|
| Chunk de entrada (index) | 947.75 kB | 591.55 kB | **−37.6 %** |
| Chunk de entrada, gzip | 235.61 kB | 153.65 kB | **−34.8 %** |
| CSS | 80.78 kB | 80.78 kB | 0 |
| CSS, gzip | 30.80 kB | 30.80 kB | 0 |
| Chunks JS iniciales (raw) | 947.75 kB | 769.19 kB | −18.8 % |
| Chunks JS iniciales (gzip) | 235.61 kB | 212.56 kB | −9.8 % |

## Qué se movió y por qué

### 1. Lazy-load de superficies pesadas (`React.lazy` + `Suspense`)

These chunks are no longer part of la primera carga; se descargan la primera vez
que el operador abre esa superficie:

| Chunk | raw | gzip |
|---|---:|---:|
| MoneyPrinterModal | 53.08 kB | 8.25 kB |
| CurlTesterModal (API Explorer) | 24.34 kB | 5.80 kB |
| AccountDetailModal | 23.67 kB | 3.17 kB |
| AdbBridgeModal | 19.76 kB | 3.36 kB |
| PostPreviewModal | 17.87 kB | 3.01 kB |
| VersionControlModal | 17.15 kB | 3.15 kB |
| PandaGridModal | 10.98 kB | 2.44 kB |
| ProxyModal | 8.97 kB | 1.83 kB |
| CodeViewerModal | 7.50 kB | 1.92 kB |
| **Total diferido** | **183.32 kB** | **32.93 kB** |

`ScheduleModal` se mantiene en el bundle inicial a propósito: es una superficie
de producto (área Calendario del dashboard §9.2 y vista §12), no una pantalla de
desarrollo. Diferirlo penalizaría la vista principal.

### 2. Vendor chunks (`build.rollupOptions.output.manualChunks`)

| Chunk | raw | gzip | Motivo |
|---|---:|---:|---|
| `motion` | 158.90 kB | 52.52 kB | `motion/react` (framer-motion) cambia muy rara vez |
| `react` | 9.93 kB | 3.13 kB | runtime |
| `icons` | 8.81 kB | 2.26 kB | `lucide-react` |

Con esto, tocar un componente del panel ya no invalida la caché de React,
motion ni de los iconos.

## Qué NO se hizo (y por qué)

- **No se añadió `recharts` ni `chart.js`.** Los charts son SVG inline
  (`src/components/design/Charts.tsx`, ~0 kB de dependencia). Un chart engine
  externo habría añadido 100+ kB para lo que aquí son 4 componentes.
- **No se virtualizó la consola de logs.** `TerminalLogs` ya corta el buffer
  (`MAX_LOG_LINES` en el servidor) y el filtro por nivel/texto opera sobre esa
  ventana acotada. Con el volumen real observado (decenas de líneas por segundo
  en picos, techo de 64 Ki en el servidor) la lista no llega al punto donde
  React empieza a sufrir. Queda como paso condicional: si el SSE supera ~5 000
  líneas en ventana, virtualizar es el siguiente trabajo, documentado como deuda.
- **No se añadieron 15 pollers.** El refresco de pantalla está centralizado en
  un único `setInterval` de 5 s (`refreshBackendData` en `App.tsx`) más el de
  `/api/stack`; el resto de superficies usan SSE o se abren bajo demanda.
- **Los screen mirrors no se renderizan a FPS altos.** `PandaGridModal` pinta
  snapshots pushed por el backend, no un stream local de frames; no hay
  `requestAnimationFrame` en bucle.

## Cómo reproducir estas cifras

```bash
npx vite build          # emitted dist/assets/*, sizes en la salida
```

Baseline de la columna "Before": commit `7e7e384` (antes del lazy-load).
