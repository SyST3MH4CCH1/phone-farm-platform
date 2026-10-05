# TASK-006: Integrar historial y acciones de despliegue reales

## Estado
- Estado: BLOCKED
- Tipo: implementación/recurso externo
- Prioridad: P1
- Requisitos relacionados: DSG-010
- Preguntas relacionadas: Q-006

## Motivo por el que no se completó en esta ejecución
El backend solo ofrece versiones actuales conocidas y salud; no expone producción/staging, historial, migraciones ni rollback de IMG-7.

## Objetivo
Mostrar entornos y cronología reales y habilitar rollback solo con una API aprobada.

## Fuente de diseño
IMG-7; ruta exacta en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/components/VersionsReferenceWorkbench.tsx` muestra Local/Dev real y marca Producción/Staging como «Sin dato del servidor».

## Diferencia exacta
La referencia contiene despliegues, timeline, hash, migraciones e incidentes que esta instalación no proporciona.

## Alcance
- In: contrato de entornos, eventos y acciones; UI de estado y permisos.
- Out: atribuir la versión local a producción o simular rollback.

## Pasos de ejecución
1. Resolver Q-006 con la fuente oficial de despliegues.
2. Integrar lista/timeline/estado de migración y acciones permitidas.
3. Verificar permisos y estados; contrastar IMG-7; actualizar DSG-010.

## Dependencias o bloqueo
Contrato y datos verificables de despliegue.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra IMG-7.
- [ ] DSG-010 actualizado con evidencia.
- [ ] Índice y reporte actualizados.

## Criterio de parada
No ofrecer una acción de rollback que no exista en el backend.
