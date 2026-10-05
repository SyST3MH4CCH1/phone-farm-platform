# TASK-005: Habilitar lectura y ejecución segura del editor Python

## Estado
- Estado: BLOCKED
- Tipo: implementación/aclaración
- Prioridad: P1
- Requisitos relacionados: DSG-009
- Preguntas relacionadas: Q-005

## Motivo por el que no se completó en esta ejecución
GET `/api/source` devuelve HTTP 404 con `EXPOSE_SOURCE=false`; no se identificó una API de ejecución de scripts con permisos y aislamiento definidos.

## Objetivo
Permitir ver archivos y ejecutar scripts aprobados desde la vista, respetando roles y seguridad.

## Fuente de diseño
IMG-6; ruta exacta en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/components/PythonReferenceWorkbench.tsx` presenta árbol/editor/panel de parámetros y explica la indisponibilidad. El visor legado se conserva.

## Diferencia exacta
La referencia muestra código cargado, ejecución, consola e historial; la instalación no habilita siquiera la lectura.

## Alcance
- In: política de acceso, API de lectura/ejecución aprobada, consola e historial real.
- Out: ejecución arbitraria sin control o eliminación de auth.

## Pasos de ejecución
1. Resolver Q-005 con responsables de seguridad/backend.
2. Definir permisos, rutas permitidas, límites y contrato de ejecución.
3. Integrar lectura/edición/ejecución y estados de error; probar roles y actualizar DSG-009.

## Dependencias o bloqueo
Autorización explícita y contrato del backend; no cambiar `EXPOSE_SOURCE` por cuenta propia.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra IMG-6.
- [ ] DSG-009 actualizado con evidencia.
- [ ] Índice y reporte actualizados.

## Criterio de parada
No exponer código fuente ni ejecutar scripts sin los límites y permisos definidos.
