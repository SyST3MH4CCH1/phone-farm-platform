# Tareas de diseño

> **Estado histórico, revalidado el 3 oct 2026:** las marcas `DONE` siguientes pertenecen al trabajo anterior y **no acreditan fidelidad al diseño**. El estado vigente, las diferencias abiertas y las tareas ejecutables están en [`docs/audit/02-task-index.md`](audit/02-task-index.md) y [`docs/audit/01-design-traceability-matrix.md`](audit/01-design-traceability-matrix.md).

### [T-001] Tokens y fuentes
- **Estado:** DONE
- **Depende de:** ninguna
- **Archivos a tocar:** src/reference.css, src/main.tsx
- **Contexto:** La aplicación ya incluye Inter Variable, JetBrains Mono y Lucide. Se centralizan los valores derivados de las capturas sin añadir paquetes.
- **Instrucciones:** 1. Registrar paleta y gradientes. 2. Importar los tokens tras los estilos existentes.
- **Valores de diseño:** lienzo `#0B0E12`; panel `#10161C`; Inter 12–25 px; gradiente lineal 125° `#15202A 0%`, `#10161C 55%`, `#0E1319 100%`.
- **Criterio de aceptación:** [x] Tokens disponibles [x] fuentes locales conservadas.
- **Verificación:** `npm run typecheck`, `npm run build`.

### [T-002] Cabecera y navegación
- **Estado:** DONE
- **Depende de:** T-001
- **Archivos a tocar:** src/components/Header.tsx, src/App.tsx, src/reference.css
- **Contexto:** El shell anterior tenía escala menor y las herramientas abrían modales directamente. Las referencias mantienen el shell visible alrededor de cada sección.
- **Instrucciones:** 1. Ajustar cabecera y lateral. 2. Navegar a secciones de página. 3. Mantener el acceso a operaciones existentes.
- **Valores de diseño:** cabecera 54 px; lateral 212 px; azul `#4199FF`; verde `#00E997`.
- **Criterio de aceptación:** [x] navegación visible [x] herramientas accesibles.
- **Verificación:** `npm run typecheck`, pruebas de navegación.

### [T-003] Vista Cuentas
- **Estado:** DONE
- **Depende de:** T-002
- **Archivos a tocar:** src/components/ReferenceViews.tsx, src/reference.css
- **Contexto:** La captura usa cuatro métricas, tabla ancha y detalle lateral. Los datos proceden de cuentas reales.
- **Instrucciones:** 1. Mostrar métricas y filtros. 2. Componer tabla. 3. Abrir el detalle existente.
- **Valores de diseño:** panel `#10161C`; azul `#4199FF`; tarjeta 8 px de radio.
- **Criterio de aceptación:** [x] tabla y filtros [x] detalle accesible.
- **Verificación:** `npm run typecheck`, captura de Cuentas.

### [T-004] Vista Cola
- **Estado:** DONE
- **Depende de:** T-002
- **Archivos a tocar:** src/components/ReferenceViews.tsx, src/reference.css
- **Contexto:** La imagen presenta métricas, pipeline, tabla y detalle. Se calculan categorías a partir de los estados actuales.
- **Instrucciones:** 1. Agrupar estados. 2. Pintar pipeline y tabla. 3. Preservar generación y vista previa.
- **Valores de diseño:** azul `#4199FF`; púrpura `#913CF5`; verde `#00E997`.
- **Criterio de aceptación:** [x] pipeline [x] acciones conservadas.
- **Verificación:** `npm run typecheck`, captura de Cola.

### [T-005] Vista Calendario
- **Estado:** DONE
- **Depende de:** T-002
- **Archivos a tocar:** src/App.tsx, src/reference.css
- **Contexto:** El calendario existente ya permite mes, semana, día, agenda y reprogramación. Se añade cabecera, métricas y próximas publicaciones.
- **Instrucciones:** 1. Mantener `ScheduleModal` embebido. 2. Añadir métricas reales. 3. Mostrar eventos próximos.
- **Valores de diseño:** tarjeta `#10161C`; borde `#28343E`; separación 12 px.
- **Criterio de aceptación:** [x] vistas y programación accesibles [x] métricas reales.
- **Verificación:** `npm run typecheck`, captura de Calendario.

### [T-006] Vista Proxies
- **Estado:** DONE
- **Depende de:** T-002
- **Archivos a tocar:** src/components/ReferenceViews.tsx, src/reference.css
- **Contexto:** Se muestran estado, latencia, lista y configuración. La telemetría ausente se identifica como tal.
- **Instrucciones:** 1. Mostrar estado real. 2. Mostrar lista y detalle. 3. Conservar modal de gestión.
- **Valores de diseño:** verde `#00E997`; rojo `#F04E62`; púrpura `#913CF5`.
- **Criterio de aceptación:** [x] lista [x] acceso a gestión.
- **Verificación:** `npm run typecheck`, captura de Proxies.

### [T-007] Vistas de herramientas
- **Estado:** DONE
- **Depende de:** T-002
- **Archivos a tocar:** src/components/ReferenceViews.tsx, src/reference.css
- **Contexto:** MoneyPrinter, Panda Live, API, Código y Versiones se presentan como páginas y enlazan sus herramientas funcionales.
- **Instrucciones:** 1. Construir composiciones de cada referencia. 2. Usar datos reales. 3. Abrir la operación existente desde cada página.
- **Valores de diseño:** panel `#10161C`; texto `#F1F5FB`; gradientes de T-001.
- **Criterio de aceptación:** [x] cinco páginas navegables [x] acciones accesibles.
- **Verificación:** `npm run typecheck`, capturas de escritorio.

### [T-008] QA visual y regresión
- **Estado:** DONE
- **Depende de:** T-003, T-004, T-005, T-006, T-007
- **Archivos a tocar:** docs/DESIGN_DEVIATIONS.md, src/reference.css
- **Contexto:** Las capturas son de 1672 × 941 px con datos y assets no presentes en el backend. La revisión debe separar diferencias de estilo de diferencias de contenido.
- **Instrucciones:** 1. Ejecutar lint, typecheck, build y tests. 2. Capturar cada vista. 3. Comparar geometría, tipografía, color y estados. 4. Registrar límites reales.
- **Valores de diseño:** viewport 1672 × 941; paleta y gradientes de T-001.
- **Criterio de aceptación:** [x] capturas a 1672 × 941 [x] pruebas de escritorio [x] desviaciones registradas; fidelidad absoluta pendiente de datos y assets.
- **Verificación:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, Playwright.
