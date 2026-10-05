# Sistema de warm-up TikTok / Instagram

## Estado: PARCIAL

Investigación realizada el **2026-10-05** (fecha del sistema). El término warm-up en este proyecto significa una rampa conservadora de publicación autorizada por API oficial y un checklist humano. No implica simular interacción humana.

## Investigación

| Fecha | Fuente (URL) | Qué confirma | Tipo | Aplicado a |
| --- | --- | --- | --- | --- |
| 2026-10-05 | [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) | `video.publish`, información del creador, consentimiento explícito, 6 inicializaciones/minuto/token, `is_aigc`, errores 401/403/429; clientes sin auditar limitados a privado | oficial | Acceso, publicación, salud |
| 2026-10-05 | [TikTok Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info) | 20 consultas/minuto/token y opciones de privacidad propias de cada creador | oficial | Acceso, límites |
| 2026-10-05 | [TikTok Upload](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video) | `video.upload`, 6 inicializaciones/minuto/token, máximo de 5 envíos pendientes por 24 h; el creador termina el post en la app | oficial | Flujo con revisión humana |
| 2026-10-05 | [TikTok Get Started](https://developers.tiktok.com/docs/en/content-posting-api-get-started) | Registro, aprobación de scope y auditoría para quitar la visibilidad privada | oficial | Gate de acceso |
| 2026-10-05 | [TikTok error handling](https://developers.tiktok.com/docs/en/tiktok-api-v2-error-handling) | `rate_limit_exceeded`, `access_token_invalid`, `scope_not_authorized` | oficial | Monitor de salud |
| 2026-10-05 | [TikTok post status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status) | Señales de riesgo, ban, revocación de autorización y estado final | oficial | Monitor de salud |
| 2026-10-05 | [TikTok scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes) | `video.upload` para borrador y `video.publish` para publicación directa requieren autorización del usuario | oficial | Menor privilegio |
| 2026-10-05 | [TikTok AI generated content](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content/) | Etiquetado requerido para IA realista; además la API Direct Post admite `is_aigc` | oficial | Guardia de contenido |
| 2026-10-05 | [TikTok Community Guidelines](https://www.tiktok.com/community-guidelines/en/integrity-authenticity/) | Prohíbe automatización masiva de cuentas, manipulación de engagement y evasión de restricciones; múltiples cuentas solo para expresión auténtica | oficial | Técnicas excluidas |
| 2026-10-05 | [Instagram Community Guidelines](https://www.facebook.com/help/477434105621119?locale=en_GB) | Prohíbe recolección artificial de engagement y contenido repetitivo/spam | oficial | Guardia de contenido |
| 2026-10-05 | [Meta AI labels](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/) | Meta aplica etiquetas de IA según señales o autodeclaración; no verifica aquí el parámetro API de publicación | oficial | Etiquetado pendiente |
| 2026-10-05 | [Meta Instagram API, colección oficial](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) | La API con Facebook Login solo accede a cuentas profesionales Business/Creator y requiere permisos de publicación | oficial | Tipo de cuenta y OAuth |
| 2026-10-05 | [Meta Instagram Login, colección oficial](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login) | Cuentas profesionales, scopes `instagram_business_*`; este flujo no exige página de Facebook | oficial | Opción de integración |
| 2026-10-05 | [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/) | Página principal bloqueada con HTTP 429; no se valida ningún número de cuota | oficial, inaccesible | Límites Meta: `A_CONFIRMAR` |
| 2026-10-05 | [Meta Graph rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) | Acceso a la página oficial bloqueado con HTTP 429; las cuotas de peticiones se dejan sin confirmar | oficial, inaccesible | Límite de peticiones Meta: `A_CONFIRMAR` |

## Límites y requisitos

| Plataforma | Concepto | Valor | Estado | Fuente |
| --- | --- | --- | --- | --- |
| TikTok | Direct Post init, por token de usuario | 6/min | CONFIRMADO | [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) |
| TikTok | Upload init, por token de usuario | 6/min | CONFIRMADO | [Upload](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video) |
| TikTok | Query Creator Info, por token de usuario | 20/min | CONFIRMADO | [Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info) |
| TikTok | Envíos pendientes de aprobación del creador | máximo 5/24 h | CONFIRMADO | [Upload](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video) |
| TikTok | Tope diario de publicaciones directas | sin cifra pública universal confirmada; depende de cuenta/app y señales de riesgo | A_CONFIRMAR | [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) |
| TikTok | Variación por antigüedad/tipo de cuenta | no documentada como rampa oficial | A_CONFIRMAR | [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) |
| Instagram | Tope de publicaciones y peticiones | sin cifra oficial accesible/verificada en esta sesión | A_CONFIRMAR | [Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing/) |
| Instagram | Tipo de cuenta, scopes, revisión, errores y etiquetado IA | pendiente de comprobación oficial actual | A_CONFIRMAR | [Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing/) |

La documentación oficial consultada no prescribe una progresión por antigüedad para “calentar” cuentas. Cualquier fase propuesta será una política interna editable, **no** una recomendación de TikTok o Meta. La opción inicial preferida para TikTok es `video.upload` con publicación final por el titular; la publicación directa solo sería posible tras revisión de la app, consentimiento y validación explícita de límites. Para Instagram, el flujo se mantiene pendiente de acceso oficial y OAuth. No hay cifras inventadas de publicaciones diarias.

Errores clasificados: en TikTok, `429/rate_limit_exceeded` implica backoff, `401/access_token_invalid` y `scope_not_authorized` implican desconexión, y `spam_risk_*` o `reached_active_user_cap` implican pausa/bloqueo para revisión. Los errores equivalentes de Instagram quedan `A_CONFIRMAR` hasta poder consultar la referencia oficial; no se infiere su semántica de códigos de terceros. La información de creador de TikTok debe consultarse justo antes de Direct Post y respetar las opciones de privacidad devueltas. No se encontró recomendación oficial de una secuencia de días o interacciones de “warm-up”.

## Técnicas descartadas y motivo

- Likes, follows, comentarios, DMs, scroll y reproducciones automatizadas: no forman parte de las APIs oficiales de publicación ni de este sistema.
- APIs privadas, scraping, automatización de app/navegador, proxies, rotación de dispositivos y fingerprints: se excluyen del sistema; el repositorio actual contiene ADB, proxies y fallback manual, que se auditan por separado y no se extienden aquí.
- Cuentas sin consentimiento OAuth del titular y compra de engagement: excluidas.

## Decisiones de diseño

- Toda configuración de cuota de publicación real arranca en `A_CONFIRMAR`; `value: null`, fuente y fecha vacías. Un límite de *peticiones* por endpoint no se usará como si fuera un límite de *publicaciones*.
- Modo simulación por defecto, interruptor global y por cuenta, auditoría persistente, idempotencia y un solo proceso por cuenta.
- Máquina propuesta: `NEW → WARMING → GRADUATED`; `CAUTION`, `PAUSED`, `BLOCKED`, `DISCONNECTED`. Los incidentes hacen retroceder o pausan; `BLOCKED` y pausas persistentes requieren registro humano para reactivar.
- Límite efectivo por ventana = mínimo de fase, techo y límite oficial menos margen; si cualquiera es desconocido, se rechaza la acción real.
- Las ventanas y separación entre publicaciones evitan ráfagas. No se utilizan para aparentar uso humano.
- Ante 429 se aplica backoff; bloqueo/restricción/resultado ambiguo pausa; 401 o scope inválido desconecta.
- El contenido idéntico o casi idéntico y el etiquetado IA deben validarse antes de cualquier publicación real.

## Arquitectura implementada

`platform/phonefarm/warmup.py` implementa un planificador aislado con reloj inyectable: límite efectivo, separación, ventana UTC, idempotencia, huella de contenido, estados, backoff, interruptor por cuenta, checklist y auditoría de decisiones. SQLite v3 guarda estados, acciones y eventos del motor; v4 guarda las confirmaciones manuales del checklist. `platform/config/warmup.json` arranca con `dry_run=true`, interruptor global activado y todos los umbrales operativos `A_CONFIRMAR`. Incluso al confirmar una política, el módulo rechaza el modo real porque no existe un conector OAuth oficial verificado. `GET /api/warmup/status` expone estados sin credenciales; `POST /register`, `/step` y `/emergency-stop` requieren administrador y registran auditoría. En **Cuentas → Rampa** y en el modal de detalle, el operador puede registrar plataforma, checklist y pausa local. Ninguna de estas acciones conecta OAuth ni habilita publicación.

La app actual usa React/Vite + Express + Flask, SQLite cifrado para parte de los datos, cola de vídeo y un publicador Instagram **no oficial** ajeno a este motor. El motor todavía no se ha conectado al flujo de publicación: `warmup_day` en cuentas sigue siendo un atributo visual, no un guardián. No se ha creado almacén de tokens OAuth porque aún no hay integración OAuth; los tokens existentes de `instagrapi` se almacenan cifrados pero no son tokens OAuth oficiales. `GRADUATED` requiere días y éxitos confirmados sin incidentes; un incidente provoca retroceso. `BLOCKED` y pausas persistentes requieren reanudación humana auditada. No se han ejecutado acciones de TikTok o Instagram.

## Cambios aplicados

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `WARMUP_SYSTEM.md` | Investigación y diseño inicial | Gate 0 antes del código de warm-up |
| `platform/config/warmup.json` | Configuración cerrada por defecto | No inventar cuotas |
| `platform/phonefarm/db.py` | Migración SQLite v3 | Persistir estados, acciones y eventos |
| `platform/phonefarm/warmup.py` | Motor de simulación y guardias | Implementar decisiones conservadoras sin API social |
| `platform/tests/test_warmup.py` | Tests con reloj inyectado y propiedad de límites | Verificar fallos cerrados y transiciones |
| `platform/phonefarm/platform.py`, `server/app.ts`, `src/components/AccountWarmupControl.tsx` | Estado, checklist y pausa local administrados por cuenta | Mostrar el bloqueo real y guardar decisiones del operador sin filtrar credenciales |

## Validaciones

| Comando o prueba | Resultado real |
| --- | --- |
| Lectura de documentación oficial TikTok | Completada 2026-10-05 |
| Lectura de Meta Developers | HTTP 429; cuotas `A_CONFIRMAR` |
| `npm run typecheck` | Aprobado tras corrección de vista previa, 2026-10-05 |
| `platform/.venv/Scripts/python.exe -m pytest platform/tests/test_warmup.py -q` | 7 aprobadas |
| `platform/.venv/Scripts/python.exe -m pytest platform/tests -q` | Suite completa aprobada tras la migración v4 y controles por cuenta; tres warnings de dependencias |
| `npm run lint` | Aprobado; actualmente es alias de `tsc --noEmit` |
| `npm run build` | Aprobado; bundle principal grande, advertencia no bloqueante |
| `npm test` | 199 aprobadas antes de añadir la prueba específica de RBAC/CSRF de la rampa; esa prueba y el archivo RBAC completo pasaron después |
| `npx playwright test e2e/warmup-ui.spec.ts --project=desktop-1440x900` | 2 aprobadas: diálogo de alta sin desbordamiento y formulario de backup propio |

## Riesgos residuales (lo que este sistema NO garantiza)

Ninguna rampa garantiza evitar restricciones. Falta acceso verificado a documentación Meta, app auditada, OAuth del titular, conector de API oficial, control de scope y cuota por cuenta, integración en el flujo de publicación, etiquetado IA definitivo y pruebas de integración reales. Los valores de fase y de publicación diaria siguen sin confirmar. Por ello el estado es **PARCIAL**, no `IMPLEMENTADO`.

## Prueba real pendiente de mi autorización

1. Registrar las apps TikTok y Meta, solicitar permisos mínimos y revisión, y conectar una cuenta propia mediante OAuth.
2. Confirmar límites en la documentación oficial y, cuando proceda, consultar cuotas reales por cuenta.
3. Ejecutar primero simulación y revisar auditoría; después solicitar autorización expresa para una única subida como borrador por API oficial.

**Tarea de acceso prioritaria para el titular:** registrar app en TikTok for Developers y Meta for Developers; solicitar Content Posting API, revisión y scopes mínimos; preparar dominio y redirect URI verificados. No almacenar credenciales en Git.

Pasos y criterio de cierre: [docs/ACCESS_TIKTOK_META.md](docs/ACCESS_TIKTOK_META.md).

## Continuidad

- Último trabajo completado: motor de simulación SQLite y 7 pruebas; todos los límites operativos sin confirmar bloquean publicación real.
- Trabajo en curso: auditoría de lanzamiento del repositorio y documentación de bloqueos.
- Siguiente acción exacta: completar registro/revisión de apps y validar documentación Meta; integrar OAuth y conector oficial antes de conectar el guardián a cualquier publicación.
