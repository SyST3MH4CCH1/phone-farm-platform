# Diferencias respecto de las imágenes de referencia

La comparación se realizó con las nueve capturas de 1672 × 941 px suministradas por el usuario y con capturas generadas en `docs/evidence/ui/reference-1672/`. El resultado **no es idéntico al 100 %**. Las diferencias siguientes son visibles y permanecen abiertas.

| Vista | Diferencia pendiente | Causa / alternativa actual |
|---|---|---|
| Cuentas | Fotografías, avatares, diez filas ilustrativas y gráficas de crecimiento | La app muestra cuentas y métricas del backend; la prueba aislada no tiene cuentas. La tabla y el detalle muestran estados vacíos reales. |
| Cola | Los 25 jobs y sus porcentajes de muestra no aparecen | La app presenta la cola real. La prueba aislada tiene cero jobs; se conserva el pipeline y la tabla. |
| Calendario | Publicaciones, miniaturas, borradores y mapa de actividad de la captura | No hay esas publicaciones ni assets en el backend de pruebas. Se mantiene el calendario funcional con sus eventos reales. |
| Proxies | Gráficas históricas, mapa, reglas de rotación y prueba detallada | El modelo actual solo expone proxy, estado, IP y latencia reciente. Se indica que la telemetría falta y se ofrece la gestión existente. |
| MoneyPrinter | Plantillas visuales, ganchos, guion completo, preview de vídeo y rendimiento | La generación real reside en `MoneyPrinterModal`; la página muestra la entrada y el estado, y abre esa herramienta. No hay esos assets ni resultados en la prueba. |
| Panda Live | Cuatro pantallas de teléfono, leases, operadores y eventos de la captura | El backend aislado no tiene dispositivos ni sesiones. La página informa el estado real y abre Panda Live. |
| cURL API | Conteos diarios, solicitud y respuesta ilustrativas | El contrato OpenAPI y el ejecutor reales están en el playground existente; el resumen evita inventar respuestas. |
| Código Python | Explorador, código de muestra y ejecución de la captura | El editor real se abre desde la página. El código mostrado en la captura no es un archivo verificado del repositorio. |
| Versiones | Tres entornos, historial de despliegues, métricas y rollback de la captura | El backend expone versión, SHA, contenedores y estado; no expone el historial ni la operación de rollback ilustrados. |

Los gradientes, pesos tipográficos, espaciados y colores se estimaron a partir de capturas rasterizadas; no se conocen los tokens originales del diseño. Los estados interactivos y el diseño móvil tampoco tienen referencia adjunta. La implementación usa los estados existentes y las pruebas responsive del repositorio.

## Assets pendientes

- Fotografías y miniaturas originales de cuentas y publicaciones.
- Vídeos y pantallas reales de los dispositivos.
- Mapa geográfico y datos históricos de telemetría.
- Datos de ejemplo autorizados para una comparación visual controlada, si se desea reproducir exactamente las cifras de las capturas.
