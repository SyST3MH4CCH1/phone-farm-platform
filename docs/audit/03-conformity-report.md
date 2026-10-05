# Informe de conformidad

**Estado global: INCOMPLETO.** Hay cambios reales en el repositorio y la app funciona, pero las vistas no son idénticas al 100 % a las referencias.

| Medida | Resultado | Criterio |
|---|---:|---|
| Cobertura de auditoría de requisitos identificados | 12 / 12 = 100 % | Todos tienen fuente, estado y evidencia en la matriz. No implica que se hayan implementado por completo. |
| Conformidad íntegra implementada | 0 / 12 = 0 % | Ningún `DSG` se puede marcar `APLICADO` bajo el criterio de identidad visual y funcional completa. Hay 10 `PARCIAL`, 1 `BLOQUEADO` y 1 `NO_VERIFICABLE`. |
| Alcance no verificable | 1 / 12 | Estados y breakpoints sin captura de referencia. |

No se calcula un porcentaje del **diseño total**: no existe Figma editable, assets originales, capturas móvil ni datos que reproduzcan las cifras históricas. El 0/12 mide requisitos **íntegramente cerrados**, no ausencia de trabajo: las pantallas quedaron estructuradas y se validaron con datos vivos.

## Validaciones ejecutadas el 3 oct 2026

| Comprobación | Resultado real |
|---|---|
| `npm run typecheck` | OK, exit 0 |
| `npm run lint` | OK, exit 0; el script ejecuta `tsc --noEmit` |
| `npm run build` | OK, exit 0; aviso no bloqueante de bundle de más de 700 kB |
| `npm test -- --run` | OK, 15 archivos y 192 pruebas tras actualizar la prueba obsoleta del Dashboard |
| Servidor local `npm run dev` | En servicio en `http://127.0.0.1:4100/`, con Flask online y sesión admin |
| Exploración visual | Dashboard y las nueve vistas revisadas en navegador; Proxies, Panda, Versiones, Python, cURL, Cuentas, Cola, Calendario y MoneyPrinter observados |
| cURL en UI | Contrato OpenAPI: 53 operaciones; GET `/api/accounts` retornó 2 cuentas |
| Python en UI | GET `/api/source` retornó HTTP 404; `EXPOSE_SOURCE=false` en esta instalación |
| `npx playwright test e2e/reference-views.spec.ts --project=desktop-1440x900` | OK, 1 prueba; recorrió y capturó las nueve vistas a 1672 × 941 en `docs/evidence/ui/reference-1672/` con el servidor/fixture E2E local. La primera corrida detectó el paso incorrecto de `logs` a Python; se corrigió y la segunda pasó. |

Primer intento de build/tests en el sandbox: falló por `Acceso denegado` al resolver los archivos de configuración de Vite/Vitest. Repetidos con ejecución escalada: los resultados anteriores son los finales. La primera corrida de tests señaló dos aserciones obsoletas que exigían tarjetas eliminadas para ajustarse a la captura; se corrigió la prueba y la segunda corrida pasó.

## Lista de fidelidad por vista

En IMG-1–IMG-9 se comprobó manualmente jerarquía, columnas, colores generales y estado real visible. No se ha medido una diferencia de píxeles reproducible ni se ha verificado cada icono, degradado, sombra, texto o interacción frente a un archivo de diseño editable. La discrepancia más grande se debe a datos/medios ausentes: 2 cuentas frente a 28 en la imagen, 0 dispositivos en línea frente a 4, MPT offline, 4 proxies offline y falta de historial de producción. Las tareas y preguntas enlazadas en la matriz delimitan estos casos.
