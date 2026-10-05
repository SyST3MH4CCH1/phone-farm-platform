# Auditoría de lanzamiento — 2026-10-05

> La preparación posterior para GitHub retiró capturas antiguas y rutas locales
> del árbol actual. El historial del remoto público todavía requiere revisión y
> posible saneamiento. Véase [GITHUB_PUBLICATION_2026-10-05.md](GITHUB_PUBLICATION_2026-10-05.md).

## Veredicto: NO_GO para lanzamiento público mañana

El código compila y las pruebas aisladas pasan. La instancia comprobada no está lista para el pipeline principal: `GET 127.0.0.1:4100/readyz` devuelve **503** con `db=true`, `flask=true`, `mpt=false`; `127.0.0.1:8080/ping` rechaza conexión. No se hizo una publicación real ni se comprobó una cadena completa con teléfonos, MPT y red social. El sistema de rampa solicitado permanece en simulación, sin OAuth oficial. Se puede considerar una demostración local cerrada del panel y la gestión de datos, siempre marcada como parcial.

**Actualización de la interfaz de rampa:** la cuenta se prepara desde **Cuentas → seleccionar cuenta → Rampa** o **Abrir → Rampa de publicación**. El checklist, la plataforma elegida y la pausa local persisten en SQLite; son controles de operador y no comprueban la plataforma social. El estado global de emergencia sigue activado. El registro local ya no pide contraseña social. La guía revisada está en [ACCOUNT_CREATION_AND_RAMP_US.md](ACCOUNT_CREATION_AND_RAMP_US.md). Se verificó el formulario en navegador con un servidor E2E sembrado; no se verificó la preparación con una cuenta social real.

## Alcance y fuente de verdad

Se revisaron `README.md`, `platform/README.md`, `AGENTS.md` (no existe en este árbol), estado Git, `package.json`/lockfiles, `.github/workflows/ci.yml`, Docker/`.dockerignore`, migraciones SQLite, Flask, Express, frontend, scripts, pruebas y documentación de diseño. Los informes previos se trataron como hipótesis: `README.md` y `platform/README.md` aún contenían descripciones antiguas de `taktik-bot`, JSON y flujos automáticos. Se corrigieron sus advertencias iniciales, pero el contenido histórico extenso necesita actualización editorial adicional.

Arquitectura operativa: React/Vite → Express (sesión/RBAC/proxy) → Flask → SQLite cifrado para cuentas/proxies y cola; MPT genera vídeo, ADB controla teléfonos, y `publisher.py` usa `instagrapi` (API no oficial) para Instagram. No hay OAuth/API oficial TikTok integrado. Hay un MCP opcional y scripts nativos/Docker. El frontend usa navegación interna en `App.tsx`; no se verificaron deep links URL independientes por sección.

## Inventario MVP y evidencia por flujo

| Sección | Implementación y conexión | Prueba realizada | Preparada para usuarios reales |
| --- | --- | --- | --- |
| Dashboard | Datos de `/api/stats`, `/api/accounts`, `/api/queue`, `/api/stack`; algunos indicadores presentan `—` cuando no hay dato | Typecheck, Vitest, E2E de cabecera 1920/1366 | Parcial: depende de servicios y datos actuales |
| Cuentas | Alta/listado/actualización/borrado en Express→Flask→SQLite; alta conserva el modal ante error. La rampa tiene checklist y pausa por cuenta persistentes | Tests Flask, RBAC/CSRF y popup E2E; alta real con cuenta social no ejecutada | Parcial: ficha local sin contraseña social, pero requiere serial y no hay OAuth oficial |
| Cola | Crear, procesar, revisar guión, marcar vídeo listo y publicar con versión; vista previa ahora usa acción según estado y conserva error | Tests API/RBAC; no se probó publicación externa | No, MPT no responde y publicador no oficial |
| Calendario | Lectura de cola y programación vía `/api/queue/:id/schedule` | No se probó arrastre y persistencia de punta a punta en navegador | Parcial |
| MoneyPrinter | UI→Express→Flask→cola→guión→MPT; se corrigió la pérdida de `custom_prompt`, voz y aspecto | Tests nuevos de persistencia y payload MPT, build | No, MPT fuera de servicio; generación MP4 real sin verificar |
| ADB Bridge | UI y endpoints de dispositivos/comandos/proxy Flask | Tests de auth; sin teléfono de prueba controlado | No verificado con hardware real |
| Panda Live | Estado de dispositivos/logs; algunas métricas explicitan falta de telemetría | Navegación/UI general; sin sesión física validada | Parcial |
| Proxies | CRUD y verificación real; rotación media se presenta sin telemetría | Código y tests; no se probaron proveedores externos | Parcial |
| cURL API | OpenAPI real y ejecutor de rutas; mutaciones exigen confirmación | Tests del spec; no se probaron todas las rutas desde la UI | Parcial |
| Código Python | Explorador/visualización; ejecución editable limitada | Lectura de código; no se demostró ejecución general | No como IDE operativo |
| Versiones | Información de stack y backups; no hay despliegue completo desde la vista | Lectura de código y build | Parcial, informativa |
| Rampa TikTok/Instagram | Motor SQLite de simulación con política `A_CONFIRMAR`, estado de lectura en Cuentas; no conectado al publicador | 7 pruebas aisladas con reloj y endpoint sin credenciales | No para cuentas reales |

Para cada flujo de negocio, la ruta crítica pasa por sesión/RBAC de Express y token interno a Flask. Los tests prueban validación y estado con una BD temporal y, en E2E, un stub Flask. **No** prueban plataformas sociales, proveedor LLM, MPT ni ADB físicos. La vista previa ya no promete edición de caption/plataforma que el backend no persiste ni publica en un solo paso; los errores permanecen visibles en el modal.

## Datos reales, simulados y límites de UI

- Cuentas, cola, proxies y estados se leen de SQLite; estadísticas de host de `psutil` son mediciones locales. Un contador sin fuente muestra `—` o “sin dato” en las vistas revisadas.
- El modo `DEMO_MODE` del generador puede producir un vídeo placeholder si está activado; debe mantenerse desactivado en producción. Las pruebas E2E siembran cuentas y usan un stub Flask; sus capturas no son evidencia de servicios reales.
- Las plantillas y ganchos de MoneyPrinter son ejemplos; ahora se identifican como tales y se envían como guía al generador. Las gráficas históricas, Python y Versiones tienen funciones informativas sin backend equivalente completo.
- `warmup_day` existente es un campo manual. El modal ya lo presenta como tal, sin afirmar una rampa de interacción automática.

## Seguridad y GitHub

Hallazgos corregidos durante esta sesión: validación de opciones de creación de trabajos a ambos lados de Express/Flask; el modal de cuenta ya no cierra al fallar la API; vista previa con estados y errores reales; `.gitignore` ampliado para `platform/platform/data`, `.playwright-mcp`, `.sisyphus`, `tmp`, `IMG` y `resized`. La BD/keys `.env`, datos, vídeos y logs operativos están ignorados. Se corrigieron afirmaciones de seguridad obsoletas en el inicio de los README.

Verificaciones: `gitleaks git .` recorrió 110 commits y señaló **5 coincidencias** en cadenas de prueba deliberadas de `test/redact-secrets.test.ts` (commit `76b5ce4`, regla `generic-api-key`); no se imprimieron los valores completos en este informe. Escaneos separados de `server`, `src`, `docs`, `platform/phonefarm`, `platform/config` y `platform/tests`: **0 leaks**. `npm audit --omit=dev --json`: **0 vulnerabilidades** reportadas. `pip-audit -r platform/requirements.txt` quedó sin respuesta del índice tras más de un minuto y se interrumpió: **sin resultado Python**. No se ha hecho revisión manual exhaustiva de cada imagen ni de la historia para datos personales; las capturas de `docs/evidence/ui/` están versionadas y deben aprobarse o redactarse antes de un repo público. Tampoco se ha probado un `git clone` limpio con todas las integraciones.

Riesgos no corregidos: `instagrapi` usa sesión de contraseña y API privada; el repo conserva proxies/ADB y fallback manual. No se extendieron esas capacidades para la rampa. El nuevo motor no controla aún el publicador existente, por lo que no se puede afirmar una aplicación global del límite. Publicar el repo en GitHub **no equivale** a autorizar acceso público a la aplicación o a las cuentas.

## Popups y modales

El formulario “Nueva cuenta” usa ahora la paleta, cabecera, campos, espaciado y botones del diseño de referencia; se comprobó que no desborda a 1366 px ni 390 px. Los modales compartidos y cuatro ventanas antiguas recibieron contenedor y campos de la paleta actual. Las confirmaciones de API/cURL y el formulario de backup sustituyen los diálogos nativos del navegador. La vista previa de post conserva la estética oscura, ahora muestra el paso real y solo permite la transición válida. **No se hizo auditoría visual completa de todos los modales ni de cada opción interna**. Resultado: coherencia **parcial**, no verificada al 100 %.

## Versión web ligera sin VPS

**Viable como panel web de lectura, planificación y aprobación, no como sustituto completo del Mini PC.** El frontend puede desplegarse como estático en Cloudflare Pages; autenticación, API y persistencia requerirían Workers + D1 (o servicio gestionado equivalente) y una migración de Express/Flask/SQLite. Los vídeos pueden guardarse en R2. Los límites gratuitos actuales de Pages incluyen 500 builds/mes y 20.000 archivos; Workers Free incluye 100.000 requests/día, y el plan Paid empieza en 5 USD/mes; R2 incluye 10 GB-mes. Es una **estimación de infraestructura base**, sin dominio, almacenamiento adicional, IA, red ni trabajo de migración. Fuentes: [Pages](https://developers.cloudflare.com/pages/platform/limits/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/). Precios consultados el 2026-10-05.

ADB, teléfonos físicos, el servidor MPT local, GPU/FFmpeg y sesiones de publicación no se trasladan a un frontend estático ni a Workers. Para conservarlos se necesita un agente local encendido con conexión saliente segura, o reemplazarlos por proveedores gestionados; Cloudflare Tunnel admite conexiones salientes desde el origen [documentación](https://developers.cloudflare.com/tunnel/configuration/). Ese agente seguiría siendo infraestructura propia aunque no sea un VPS. Alternativa de solo lectura más simple: publicar una SPA con datos de prueba **claramente etiquetados** y sin controles de operación, con coste de hosting cercano a 0 en cuota gratuita; no sería este MVP funcional.

## Validación ejecutada

| Comando / comprobación | Resultado |
| --- | --- |
| `npm run typecheck` y `npm run lint` | Pasan; lint es alias de TypeScript, no ESLint |
| `npm run build` | Pasa fuera del sandbox; bundle principal 847 kB, aviso de tamaño |
| `npm test` | 15 archivos, 199 tests pasan; Vite tarda en cerrar |
| `platform/.venv/Scripts/python.exe -m pytest platform/tests -q` | 74 tests pasan, tres warnings de dependencias |
| `npx playwright test e2e/header-layout.spec.ts --project=wide-1920x1080 --project=smoke-1366x768` | 2 pasan con servidor E2E sembrado |
| `GET :4100/healthz` / `readyz` | 200 / 503 (`mpt=false`) |
| `GET :5000/healthz` / `readyz` | 200 / 200 |
| `GET :8080/ping` | Conexión rechazada |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas |
| `pip-audit -r platform/requirements.txt` | Sin resultado por espera de red; interrumpido |
| `gitleaks git` | 5 cadenas de fixture en historial; sin evidencia de secreto real |

## Decisiones pendientes para levantar el NO_GO

1. Restaurar MPT y repetir creación de guión→MP4→vista previa con una cuenta de prueba autorizada; comprobar que no se activa `DEMO_MODE`.
2. Sustituir el publicador privado por API oficial y completar acceso/revisión OAuth de TikTok y Meta; registrar límites reales por cuenta. **Ninguna acción social real se ejecutará sin autorización expresa.**
3. Conectar el guardián de rampa al único punto de publicación y probar corte de emergencia, idempotencia y recuperación con proveedor real autorizado.
4. Revisar capturas e historial para datos personales antes de hacer público GitHub; repetir escaneo desde clon limpio y cerrar la auditoría Python.
5. Hacer recorrido manual/E2E de todos los botones/modales en la instancia real y documentar casos de error.
