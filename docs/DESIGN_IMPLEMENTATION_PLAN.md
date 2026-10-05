# Plan de implementación visual — Phone Farm

> Plan histórico. La implementación y comprobación actual del 3 oct 2026 se registran en [`docs/audit/README.md`](audit/README.md). Las tareas y estados anteriores no se aceptaron sin nueva verificación.

## Objetivo

Adaptar las nueve secciones de las capturas de 3 de octubre de 2026 a la aplicación React existente. `main-farmphone.png` representa el estado anterior del dashboard. Las capturas son referencias de escritorio a 1672 × 941 px; las cifras ilustradas no sustituyen los datos reales del servidor.

## Auditoría

- Stack: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4.
- Estilos: `src/index.css` y utilidades Tailwind; tokens complementarios en `src/reference.css`.
- Fuentes locales ya instaladas: Inter Variable y JetBrains Mono.
- Iconos y animación ya instalados: Lucide React y Motion.
- Componentes reutilizados: Header, ScheduleModal, modales funcionales, TerminalLogs, paneles y componentes de `src/components/design`.
- No se requieren dependencias nuevas.

## Especificación visible

| Propiedad | Referencia | Certeza |
|---|---|---|
| Tamaño de las capturas | 1672 × 941 px | Medido |
| Cabecera / franja de estado / lateral | 54 / ~31 / ~212 px | Medido / aproximado |
| Lienzo | `#0B0E12` a `#0A0F15` | Muestreo raster |
| Paneles | `#10161C` a `#151D25` | Muestreo raster |
| Texto principal | `#F1F5FB` | Aproximado |
| Texto secundario | `#9AAFC5` | Aproximado |
| Azul / verde / púrpura / ámbar / rojo | `#4199FF` / `#00E997` / `#913CF5` / `#FFB900` / `#F04E62` | Aproximado |
| Radio / borde / espacio | 8 px / 1 px / 12–16 px | Aproximado |
| Tipografía | Inter Variable 400–750; JetBrains Mono para datos | ⚠️ ASUMIDO |
| Título / panel / texto / metadato | 25 / 15 / 12 / 10–11 px | Aproximado |
| Gradiente de tarjeta | lineal 125°, `#15202A 0%`, `#10161C 55%`, `#0E1319 100%` | ⚠️ ASUMIDO |
| Botón azul | lineal 90°, `#1979ED 0%`, `#59AAFF 100%` | ⚠️ ASUMIDO |
| Botón verde | lineal 90°, `#00D68A 0%`, `#00F0A1 100%` | ⚠️ ASUMIDO |
| Sombra | `0 8px 28px #0000002E` | ⚠️ ASUMIDO |

No hay imágenes de estados hover, focus, disabled o vista móvil. Se usan los estados de los componentes existentes y se respetan las pruebas responsive actuales.

## Arquitectura

1. **Tokens:** `src/reference.css` define la paleta, superficies, gradientes y tamaños reutilizados.
2. **Primitivos:** tarjeta de métrica, sección, estado, barra de progreso y tabla en `src/components/ReferenceViews.tsx`.
3. **Secciones:** Cuentas, Cola, Proxies, MoneyPrinter, Panda Live, cURL API, Código Python y Versiones usan esos primitivos y datos reales.
4. **Calendario:** conserva `ScheduleModal` embebido y sus funciones de programación, con una composición exterior acorde a la captura.
5. **Acciones:** los modales operativos existentes siguen disponibles desde cada sección.

## Aceptación y riesgos

- Las nueve secciones se abren desde la navegación sin cubrir el shell.
- Las acciones de backend existentes siguen accesibles.
- La compilación TypeScript, build y tests pasan; se revisan capturas de escritorio y móvil.
- Las capturas incluyen imágenes, telemetría y funciones que el backend actual no proporciona. No se simulan como datos reales. Esos límites se detallan en `docs/DESIGN_DEVIATIONS.md`.
- La coincidencia visual absoluta requiere los assets originales, el mismo estado de datos y captura comparativa en el mismo navegador y viewport.
