# TASK-001: Cerrar las diferencias visuales medibles del shell y Dashboard

## Estado
- Estado: READY
- Tipo: implementación/validación
- Prioridad: P0
- Requisitos relacionados: DSG-001, DSG-002, DSG-012
- Preguntas relacionadas: Q-001

## Motivo por el que no se completó en esta ejecución
Se aplicó y comprobó la composición, pero las capturas nuevas siguen sin una comparación píxel a píxel reproducible; quedan diferencias de densidad, iconografía y proporciones. Los estados móvil/hover carecen de fuente exacta. Este trabajo implementable permanece abierto y el resultado global es INCOMPLETO.

## Objetivo
Igualar las zonas definidas de IMG-1–IMG-10 y guardar evidencia comparativa a 1672 × 941; documentar por separado los estados no especificados.

## Fuente de diseño
IMG-1–IMG-9 y IMG-10, rutas exactas en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/App.tsx`, `src/components/Header.tsx`, `src/reference.css`; shell y Dashboard de tres columnas en marcha.

## Diferencia exacta
El diseño visible muestra otra densidad de menú, tamaño de iconos, alturas de barras, posiciones de tarjetas, radios y tratamiento de gráficos. No se ha alcanzado ni demostrado identidad píxel a píxel.

## Alcance
- In: medición/ajuste de shell y Dashboard, comparación visual de las nueve vistas, estados responsive deducibles.
- Out: inventar contenido dinámico o activar servicios no disponibles.

## Pasos de ejecución
1. Capturar la app en viewport 1672 × 941 para cada vista y cotejarla con los PNG de referencia.
2. Ajustar tokens y componentes compartidos; corregir cada diferencia visible definida.
3. Comprobar anchos menores, teclado y focus sin atribuirlos falsamente a una captura ausente.
4. Ejecutar typecheck, lint, build y tests; guardar evidencia y actualizar matriz/informe.

## Dependencias o bloqueo
Ninguno para las diferencias visibles. Q-001 solo limita assets originales y estados no mostrados.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra la fuente de diseño.
- [ ] DSG-001, DSG-002 y DSG-012 actualizados con evidencia.
- [ ] Índice de tareas y reporte actualizados.

## Criterio de parada
No inventar assets, métricas ni una aprobación de diseño para estados que no se aportaron.
