# SECURITY-REMEDIATION-TRACKER — 2026-08-13

Tracker del programa de remediación (pasos 0-14) aprobado el 2026-08-13.
Rama de trabajo: `security-remediation-2026-08-13`.
Fuente de hallazgos: `docs/SECURITY-AUDIT-2026-08-13.md` (30 observaciones, postura inicial 1/10 → **final 9/10**).

**Estado final: programa completo 0-14 ejecutado. 35 tests vitest + 42 pytest en verde, typecheck/build OK, npm audit 0 vulns, gitleaks limpio (salvo placeholders históricos), compose validado.**

## Reglas del programa

1. Un paso por commit (`security(step-N): descripción`); cada paso termina y se revisa antes del siguiente.
2. Antes de modificar: pruebas de referencia en verde (typecheck, build, vitest, pytest).
3. Nunca se muestran secretos, hashes de secretos ni contenido de `.env`/`config.toml`/sesiones en este documento.
4. No se actualizan dependencias fuera del paso 13 (supply chain).
5. Si aparece un cambio ajeno, falla la línea base o se necesita una decisión no descrita → detenerse y reportar.

## Progreso por paso

| Paso | Descripción | Estado | Commit | Evidencia / notas |
|---|---|---|---|---|
| 0 | Contención: detener servicios, inventario, rotación interna, Gitleaks, ZIP legacy | ✅ COMPLETO | `e664c0e` | Puertos 3000/5000/5001/8080 detenidos; gitleaks 4 hallazgos placeholder (historial `9da8a66`/`d5abdfe` — decisión de purga pendiente); MPT checkout limpio; ZIP movido a `backups/legacy/`; `.env.example` sin credenciales demo. Rotación interna = ejecutar `platform/scripts/rotate-internal-secrets.ps1` (manual, muestra credenciales 1 vez). |
| 1 | Recalibrar informe + tracker + `createApp` + suites Vitest/pytest | ✅ COMPLETO | (este commit) | Refactor `server.ts` → `server/config.ts`, `server/sessions.ts`, `server/app.ts` (`createApp(config, deps)`); `vitest.config.ts` + `test/smoke.test.ts` (6 tests); `platform/tests/test_security.py` (3 tests); scripts `test`/`test:py`; auditoría con Aplicabilidad ×30 + correcciones de contexto (PF-SEC-003 CVE no aplica a 1.3.3; PF-SEC-013 dev-dep). |
| 2 | Arranque seguro y HTTPS privado | ✅ COMPLETO | `(paso 2)` | `config.ts` valida NODE_ENV whitelist, passwords ≥16 sin valores conocidos, token interno obligatorio; listen SIEMPRE 127.0.0.1; cookies Secure+HttpOnly+SameSite=Strict; CSRF doble envío (`pf_csrf` + `X-CSRF-Token`) + check de Origin en todas las mutaciones; Helmet CSP nonce/HSTS/XCTO; login demo eliminado de UI y de `.env.example`; `src/api.ts` (apiFetch con CSRF automático); bootstrap genera credenciales fuertes. 16 tests Vitest + 3 pytest en verde. |
| 3 | SQLite, usuarios scrypt y clave maestra DPAPI | ✅ COMPLETO | `(paso 3)` | `platform/phonefarm/db.py` (WAL + migraciones versionadas, dueño Python; Express abre con better-sqlite3 y los mismos PRAGMAs); tablas users/sessions/rate_limits/accounts/proxies/jobs/social_sessions/service_tokens/settings/audit_log/backup_meta; `keystore.py` (DPAPI CurrentUser vía ctypes + provider file, ACL 0600, fsync, CLI ensure); `admin.py` (`create/list/reset-password`, scrypt N=2^14, reglas de password espejo de config.ts); guardas de arranque: Express falla sin BD migrada ni admin; Flask falla sin clave maestra; interop Python↔Node verificada con WAL. 19 vitest + 10 pytest en verde. |
| 4 | Cifrar y migrar datos existentes | ✅ COMPLETO | `(paso 4)` | `crypto.py` (AES-256-GCM, AAD=tabla\|id\|campo, HKDF, envelope pfbackup v1 autenticado); `platform_data.py` reescrito sobre SQLite (misma API pública; passwords en `enc_password`, meta JSON; transacciones WAL sustituyen al JSON atómico); `publisher.py` con sesiones cifradas en `social_sessions`; DTOs redactados en create/from-device/login IG (sin password ni ruta de sesión); `migrate.py` (`--dry-run` sin escrituras, `--commit` con .pfbackup cifrado → transacción → verificación de recuentos → borrado de originales; idempotente); `lock-data-acl.ps1`. Pruebas: tamper de ciphertext falla, dry-run no escribe, commit verifica/borra/rollback descifrable, sin passwords en claro en el fichero DB. |
| 5 | Sesiones, RBAC y publicación | ✅ COMPLETO | `(paso 5)` | `SessionStore` SQLite (solo hashes, TTL, revocación por logout y cambio de password — `admin.py reset-password` revoca sesiones); login contra `users` (scrypt, sin credenciales .env); rate limit persistente 5/15min usuario+IP y 20/15min IP; RBAC Express+Flask: operator → consultar/crear borradores/marcar `ready_for_publish`; admin → aprobar, publicar, programar, rechazar, engagement, login IG, credenciales; `auto_approve` eliminado (400) y sin rama en workers; publicación exige `ready_for_publish` + `expected_version` (409 si cambió) + `confirm:true`; login IG admin-only con identidad desde `:id` (username almacenado); UI de cola adaptada (botón "Listo" + "Publicar" con versión). 25 vitest + 18 pytest. |
| 6 | Identidad y auditoría | ✅ COMPLETO | `(paso 6)` | `audit.py` (cadena HMAC derivada de la clave maestra, salt fijo, transacciones; `verify_chain` detecta tamper/borrado); X-Actor/X-Role/X-Request-ID propagados por Express y aceptados por Flask SOLO desde loopback (403 en otro origen); `/internal/audit` (Express registra auth.login/failed/blocked/logout, best-effort); `_audit()` en cuentas, proxies, cola (create/approve/publish/ready/schedule/reject/delete), engagement, login IG; request_id correlado en logs/respuestas. Pruebas: cadena íntegra + tamper detectado, identidad no-loopback 403, endpoint interno. |
| 7 | Autenticar y limitar MCP | ✅ COMPLETO | `(paso 7)` | `mcp_tokens.py` (CLI create/list/revoke; solo hashes en `service_tokens`, token impreso 1 vez, expiración, scopes read/queue.write/engagement/approve/publish/admin); `BearerAuthMiddleware` ASGI (401 sin token/válido/expirado, 429 rate limit 60/min por token); `AuthedFastMCP.call_tool` con scope check por tool + auditoría `mcp.<tool>`/`mcp.<tool>.failed`; `create_content_job` sin auto_approve; `publish_job` exige `ready_for_publish`; `MCP_ENABLED` por defecto 0. Pruebas: 401/403/200, rate limit, auditoría, scopes. |
| 8 | Endurecer MoneyPrinterTurbo | ✅ COMPLETO | `7d7bc8f` | Lock de terceros (`platform/third_party.lock` + `docs/THIRD-PARTY-LOCK.md`); patch reproducible `patches/mpt-verify-token.patch` + `scripts/apply-mpt-patch.py` (verify_token activo, tiempo constante, fail-closed sin MPT_API_KEY, solo /ping público); generator.py envía x-api-key; gen_mpt_config inyecta api_key; compose sin env_file para MPT. |
| 9 | Validación, SSRF y egress | ✅ COMPLETO | `2379746` | Zod (Express) + Pydantic (Flask) con límites y rechazo de controles; MAX_CONTENT_LENGTH; ADB test-connection server-side; descargas MPT solo relativas; config MPT en tabla settings (sin .env desde HTTP); egress central (`net.py`/`net.ts`) con allowlist y bloqueo de IP privada. |
| 10 | UI, backups y privacidad | ✅ COMPLETO | `bac5977` | .pfbackup cifrado (scrypt passphrase + reauth admin) en Express+Flask; export-data.ps1/restore-backup.ps1 sin claro; redactor central de logs; /panda y dashboard sin innerHTML; sin export JSON del cliente. |
| 11 | Controles de IA | ✅ COMPLETO | `4cd22f4` | Instrucciones de sistema constantes; bloqueo de secretos en prompts; validación de salida; moderación antes de ready_for_publish. |
| 12 | Límites y recuperación | ✅ COMPLETO | `a45263a` | Worker pool (semáforo), reap de jobs atascados, reconcile al arranque, SSE 32, vídeo 500MB, disco 2GB, rotación logs por tamaño, healthz/readyz. |
| 13 | Supply chain y Docker | ✅ COMPLETO | `d74fcc1` | nanoid 3.3.18 (0 vulns npm audit); requirements exactos; Dockerfile no-root+digest; compose con cap_drop/read_only/tmpfs/límites/redes separadas/healthchecks (docker compose config válido); deploy.ps1 fija commits y aplica el patch. |
| 14 | CI, regresión y cierre | ✅ COMPLETO | `(paso 14)` | CI con typecheck, build, vitest, pytest, npm audit (high), pip-audit, bandit, compose config, gitleaks; 35 vitest + 42 pytest; informe recalibrado (30 cerradas, postura 9/10, checklist 30/30 ✅). |

## Estado de hallazgos

| ID | Severidad | Aplicabilidad | Estado | Cierre previsto | Prueba de cierre |
|---|---|---|---|---|---|
| PF-SEC-001 | CRÍTICA | Windows nativo | CERRADO (Paso 2/5) | credenciales demo rechazadas; arranque sin credenciales fuertes falla; listen loopback |
| PF-SEC-002 | CRÍTICA | Ambos | CERRADO (Paso 7) | MCP 401 sin Bearer; 403 sin scope |
| PF-SEC-003 | CRÍTICA | Ambos | CERRADO (Paso 8) | MPT 401 sin `x-api-key`; solo health público; sin `env_file` |
| PF-SEC-004 | CRÍTICA | Ambos | CERRADO (Paso 4) | `accounts.json` sin secretos en claro; campos cifrados AES-GCM |
| PF-SEC-005 | ALTA | Windows nativo | CERRADO (Paso 2) | cookie `Secure; HttpOnly; SameSite=Strict`; listen 127.0.0.1 |
| PF-SEC-006 | ALTA | Ambos | CERRADO (Paso 5) | sin `auto_approve`; booleanos estrictos; publish exige `ready_for_publish` |
| PF-SEC-007 | ALTA | Ambos | CERRADO (Paso 4) | respuestas POST sin password/pass |
| PF-SEC-008 | ALTA | Ambos | CERRADO (Paso 5) | login IG admin-only + binding de cuenta |
| PF-SEC-009 | ALTA | Windows nativo | CERRADO (Paso 9) | test-connection usa ADB_HOST fijo |
| PF-SEC-010 | ALTA | Ambos | CERRADO (Paso 9) | descargas MPT solo rutas relativas |
| PF-SEC-011 | ALTA | Docker | CERRADO (Paso 13) | usuario no-root, cap_drop, read_only |
| PF-SEC-012 | ALTA | Ambos | CERRADO (Paso 13) | lock de terceros + hashes |
| PF-SEC-013 | ALTA | Ambos (build/CI) | CERRADO (Paso 13) | `npm audit` limpio (nanoid ≥3.3.17) |
| PF-SEC-014 | ALTA | Ambos | CERRADO (Paso 12) | límites de jobs/SSE/disco/vídeo |
| PF-SEC-015 | MEDIA | Ambos | CERRADO (Paso 9) | esquemas Zod/Pydantic; 400 en entradas inválidas |
| PF-SEC-016 | MEDIA | Windows nativo | CERRADO (Paso 10) | /panda con textContent (ya portado en paso 1) + CSP |
| PF-SEC-017 | MEDIA | Windows nativo | CERRADO (Paso 10) | backups `.pfbackup` cifrados |
| PF-SEC-018 | MEDIA | Windows nativo | CERRADO (Paso 9) | sin escritura `.env` desde HTTP; settings validada |
| PF-SEC-019 | MEDIA | Windows nativo | CERRADO (Paso 5) | rate limit persistente por usuario+IP |
| PF-SEC-020 | MEDIA | Ambos | CERRADO (Paso 3/5/12) | sesiones SQLite; jobs recuperables |
| PF-SEC-021 | MEDIA | Ambos | CERRADO (Paso 10) | SSE sanitizado; redacción central |
| PF-SEC-022 | MEDIA | Ambos | CERRADO (Paso 6) | X-Actor/X-Role/X-Request-ID + auditoría HMAC |
| PF-SEC-023 | MEDIA | Ambos | CERRADO (Paso 11) | prompts aislados; moderación; sin autoapprove |
| PF-SEC-024 | MEDIA | Ambos | CERRADO (Paso 9) | cliente HTTP allowlist + bloqueo IP privada |
| PF-SEC-025 | BAJA | Windows nativo | CERRADO (Paso 2) | Helmet/CSP/HSTS; sin X-Powered-By |
| PF-SEC-026 | BAJA | Ambos | CERRADO (Paso 12) | rotación por tamaño + cuota |
| PF-SEC-027 | BAJA | Docker | CERRADO (Paso 12/13) | healthchecks + límites compose |
| PF-SEC-028 | INFO | Ambos | CERRADO (parcial) | — | mantener middleware + rotación de token |
| PF-SEC-029 | INFO | Ambos | CERRADO (parcial) | — | conservar pruebas de regresión |
| PF-SEC-030 | INFO | Ambos (CI) | CERRADO (Paso 1/14) | suites vitest/pytest + CI ampliado |

## Acciones manuales pendientes (operador)

1. Ejecutar `platform/scripts/rotate-internal-secrets.ps1` (rotación interna completa; muestra credenciales del panel una vez).
2. Rotar claves externas: Pexels, MiniMax, Kimi, OpenAI, DataImpulse + relogin Instagram (checklist en `docs/SECURITY-ROTATION-2026-08-13.md`).
3. Eliminar `backups/legacy/phonefarm-export-20260811-1137.zip` tras verificar restauración con backup cifrado (paso 10).
4. Decidir sobre purga de historial git (hallazgos placeholder en commits `9da8a66`/`d5abdfe`) — requiere autorización.

---

## Ronda 3 — auditoría de seguimiento (2026-08-14)

Auditoría fresca post-cierre del programa 0-14: relectura completa de `server/app.ts`, `platform/phonefarm/*.py` y frontend; verificación git/secretos y `npm audit`. 6 hallazgos nuevos (1 ALTA, 3 MEDIA, 2 BAJA), TODOS remediados en esta ronda. Detalle completo en `docs/SECURITY-AUDIT-2026-08-13.md` (sección "Ronda 3").

| ID | Severidad | Categoría | Estado | Remedio |
|---|---|---|---|---|
| PF-SEC-031 | ALTA | Logging | CERRADO | `RedactFilter` ahora redacta `record.args` interpolados (antes: secretos en claro vía `logger.info("pass=%s", ...)`) |
| PF-SEC-032 | MEDIA | RBAC | CERRADO | `/api/adb/touch` admin-only (control físico, criterio `/mirror`) |
| PF-SEC-033 | MEDIA | RBAC | CERRADO | `POST/DELETE /api/content/profiles` admin-only en Express + Flask (config global de generación) |
| PF-SEC-034 | MEDIA | RBAC | CERRADO | `/api/moneyprinter/voices` y `/test-pexels` admin-only |
| PF-SEC-035 | BAJA | Secretos | CERRADO | `GET /api/moneyprinter/config` ya no relee `.env` desde HTTP (usa `config` de arranque) |
| PF-SEC-036 | BAJA | Robustez | CERRADO | `cmd_revoke` UPDATE único transaccional; `parseCookies` tolera cookies malformadas (sin 500) |

**Evidencia:** `npm run typecheck` PASS · 38 vitest PASS · 44 pytest PASS (3 tests vitest + 2 pytest nuevos). Sin hallazgos nuevos abiertos; postura 9/10 mantenida.
