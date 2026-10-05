# TASK-004: Validar teléfonos conectados y datos de sesión en Panda Live

## Estado
- Estado: BLOCKED
- Tipo: implementación/recurso externo
- Prioridad: P1
- Requisitos relacionados: DSG-007
- Preguntas relacionadas: Q-004

## Motivo por el que no se completó en esta ejecución
ADB indica 0 dispositivos online; el servidor tampoco aporta lease, operadores ni eventos con la forma de IMG-4.

## Objetivo
Renderizar capturas reales de teléfonos y datos de sesión/operador verificados.

## Fuente de diseño
IMG-4; ruta exacta en `docs/audit/00-sources-of-truth.md`.

## Estado actual del código
`src/components/PandaReferenceGrid.tsx` consulta ADB, usa `/api/adb/screenshot/:serial` cuando un teléfono está online y muestra vacío honesto si no hay señal.

## Diferencia exacta
La referencia contiene cuatro pantallas activas y un panel con lease/batería/operador; esta instalación ofrece dos cuentas vinculadas y ninguna pantalla ADB.

## Alcance
- In: teléfonos de prueba, captura, lease/operador/eventos, estados online/pausa/offline.
- Out: imágenes falsas de aplicaciones externas.

## Pasos de ejecución
1. Resolver Q-004 y conectar al menos un dispositivo de prueba autorizado.
2. Confirmar contrato de captura y telemetría; integrar campos faltantes.
3. Verificar estados y acción de control; actualizar DSG-007.

## Dependencias o bloqueo
Dispositivo ADB y contrato de sesión disponibles.

## Definition of Done
- [ ] Cambio implementado en el repositorio.
- [ ] Estados y breakpoints definidos cubiertos.
- [ ] Tests pertinentes actualizados y ejecutados.
- [ ] Resultado contrastado contra IMG-4.
- [ ] DSG-007 actualizado con evidencia.
- [ ] Índice y reporte actualizados.

## Criterio de parada
No atribuir a un dispositivo desconectado una pantalla, batería o lease inventados.
