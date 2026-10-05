# TASK-002: Integrar datos reales para Cuentas, Cola, Calendario, cURL y Proxies

## Estado
- Estado: BLOCKED
- Tipo: implementación/recurso externo
- Prioridad: P1
- Requisitos relacionados: DSG-003, DSG-004, DSG-005, DSG-008, DSG-011
- Preguntas relacionadas: Q-002

## Motivo por el que no se completó en esta ejecución
El backend solo expone estados actuales; no provee las series, países, métricas sociales, ETA/prioridad ni miniaturas que aparecen en IMG-1/2/5/8/9.

## Objetivo
Mostrar estas secciones con datos reales y sus estados vacío/error, manteniendo el layout de las capturas.

## Fuente de diseño
IMG-1, IMG-2, IMG-5, IMG-8, IMG-9; rutas en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/components/{ReferenceViews,AccountReferenceDetail,CalendarInsights,ApiReferenceWorkbench,ProxyReferenceWorkbench,QueueReferenceDetail}.tsx`; listas/KPIs actuales conectados.

## Diferencia exacta
Las curvas y barras históricas, datos de audiencia, distribución por país, tiempos/prioridades y fotos del PNG no se derivan de los contratos actuales.

## Alcance
- In: endpoints/documentación/dataset aprobados, mapeo de datos, estados de error y QA visual.
- Out: copiar cifras o imágenes del mockup como estado de producción.

## Pasos de ejecución
1. Resolver Q-002 y documentar contratos/campos y fuente real de medios.
2. Integrar respuestas en las cinco vistas; mantener carga/vacío/error.
3. Probar con fixtures autorizados y servidor real; contrastar con cada PNG.
4. Actualizar DSG y el reporte.

## Dependencias o bloqueo
Q-002: contrato y fuente de datos verificables.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra la fuente de diseño.
- [ ] DSG-003/004/005/008/011 actualizados con evidencia.
- [ ] Índice de tareas y reporte actualizados.

## Criterio de parada
No fabricar datos operativos ni localizar proxies por su IP sin una fuente aprobada.
