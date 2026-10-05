# TASK-003: Mostrar salidas y previsualización reales de MoneyPrinter

## Estado
- Estado: BLOCKED
- Tipo: implementación/recurso externo
- Prioridad: P1
- Requisitos relacionados: DSG-006
- Preguntas relacionadas: Q-003

## Motivo por el que no se completó en esta ejecución
MoneyPrinterTurbo figura offline en `/api/stack`; no hay videos ni miniaturas de salida disponibles para el panel derecho de IMG-3.

## Objetivo
Integrar lotes, vista previa y resultados de generación reales.

## Fuente de diseño
IMG-3; ruta exacta en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/components/MoneyPrinterReferenceWorkbench.tsx` crea solicitudes reales y muestra estado/salidas que el backend devuelve.

## Diferencia exacta
El video central y las tres salidas recientes de la captura carecen de fuente de medios en la instalación actual.

## Alcance
- In: contrato de MPT, reproducción y miniaturas, estados de progreso/vacío/error.
- Out: video simulado o salida marcada como completada sin archivo.

## Pasos de ejecución
1. Resolver Q-003 y poner disponible una instancia/dataset MPT aprobado.
2. Integrar listado de outputs y reproductor en la composición existente.
3. Verificar generación, carga y reproducción; actualizar DSG-006.

## Dependencias o bloqueo
MPT online y contrato/salidas reales.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra IMG-3.
- [ ] DSG-006 actualizado con evidencia.
- [ ] Índice y reporte actualizados.

## Criterio de parada
No usar fotogramas recortados del PNG como salidas de trabajos reales.
