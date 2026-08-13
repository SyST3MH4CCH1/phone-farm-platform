# SECURITY-REMEDIATION-TRACKER — 2026-08-13

Tracker del programa de remediación (pasos 0-14) aprobado el 2026-08-13.
Rama de trabajo: `security-remediation-2026-08-13`.
Fuente de hallazgos: `docs/SECURITY-AUDIT-2026-08-13.md` (30 observaciones, postura inicial 1/10).

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
| 3 | SQLite, usuarios scrypt y clave maestra DPAPI | ⏳ PENDIENTE | — | — |
| 4 | Cifrar y migrar datos existentes | ⏳ PENDIENTE | — | — |
| 5 | Sesiones, RBAC y publicación | ⏳ PENDIENTE | — | — |
| 6 | Identidad y auditoría | ⏳ PENDIENTE | — | — |
| 7 | Autenticar y limitar MCP | ⏳ PENDIENTE | — | — |
| 8 | Endurecer MoneyPrinterTurbo | ⏳ PENDIENTE | — | — |
| 9 | Validación, SSRF y egress | ⏳ PENDIENTE | — | — |
| 10 | UI, backups y privacidad | ⏳ PENDIENTE | — | — |
| 11 | Controles de IA y publicación | ⏳ PENDIENTE | — | — |
| 12 | Límites y recuperación | ⏳ PENDIENTE | — | — |
| 13 | Supply chain y Docker | ⏳ PENDIENTE | — | — |
| 14 | CI, regresión y cierre | ⏳ PENDIENTE | — | — |

## Estado de hallazgos

| ID | Severidad | Aplicabilidad | Estado | Cierre previsto | Prueba de cierre |
|---|---|---|---|---|---|
| PF-SEC-001 | CRÍTICA | Windows nativo | ABIERTO | Paso 2/5 | credenciales demo rechazadas; arranque sin credenciales fuertes falla; listen loopback |
| PF-SEC-002 | CRÍTICA | Ambos | ABIERTO | Paso 7 | MCP 401 sin Bearer; 403 sin scope |
| PF-SEC-003 | CRÍTICA | Ambos | ABIERTO | Paso 8 | MPT 401 sin `x-api-key`; solo health público; sin `env_file` |
| PF-SEC-004 | CRÍTICA | Ambos | ABIERTO | Paso 4 | `accounts.json` sin secretos en claro; campos cifrados AES-GCM |
| PF-SEC-005 | ALTA | Windows nativo | ABIERTO | Paso 2 | cookie `Secure; HttpOnly; SameSite=Strict`; listen 127.0.0.1 |
| PF-SEC-006 | ALTA | Ambos | ABIERTO | Paso 5 | sin `auto_approve`; booleanos estrictos; publish exige `ready_for_publish` |
| PF-SEC-007 | ALTA | Ambos | ABIERTO | Paso 4 | respuestas POST sin password/pass |
| PF-SEC-008 | ALTA | Ambos | ABIERTO | Paso 5 | login IG admin-only + binding de cuenta |
| PF-SEC-009 | ALTA | Windows nativo | ABIERTO | Paso 9 | test-connection usa ADB_HOST fijo |
| PF-SEC-010 | ALTA | Ambos | ABIERTO | Paso 9 | descargas MPT solo rutas relativas |
| PF-SEC-011 | ALTA | Docker | ABIERTO | Paso 13 | usuario no-root, cap_drop, read_only |
| PF-SEC-012 | ALTA | Ambos | ABIERTO | Paso 13 | lock de terceros + hashes |
| PF-SEC-013 | ALTA | Ambos (build/CI) | ABIERTO | Paso 13 | `npm audit` limpio (nanoid ≥3.3.17) |
| PF-SEC-014 | ALTA | Ambos | ABIERTO | Paso 12 | límites de jobs/SSE/disco/vídeo |
| PF-SEC-015 | MEDIA | Ambos | ABIERTO | Paso 9 | esquemas Zod/Pydantic; 400 en entradas inválidas |
| PF-SEC-016 | MEDIA | Windows nativo | ABIERTO | Paso 10 | /panda con textContent (ya portado en paso 1) + CSP |
| PF-SEC-017 | MEDIA | Windows nativo | ABIERTO | Paso 10 | backups `.pfbackup` cifrados |
| PF-SEC-018 | MEDIA | Windows nativo | ABIERTO | Paso 9 | sin escritura `.env` desde HTTP; settings validada |
| PF-SEC-019 | MEDIA | Windows nativo | ABIERTO | Paso 5 | rate limit persistente por usuario+IP |
| PF-SEC-020 | MEDIA | Ambos | ABIERTO | Paso 3/5/12 | sesiones SQLite; jobs recuperables |
| PF-SEC-021 | MEDIA | Ambos | ABIERTO | Paso 10 | SSE sanitizado; redacción central |
| PF-SEC-022 | MEDIA | Ambos | ABIERTO | Paso 6 | X-Actor/X-Role/X-Request-ID + auditoría HMAC |
| PF-SEC-023 | MEDIA | Ambos | ABIERTO | Paso 11 | prompts aislados; moderación; sin autoapprove |
| PF-SEC-024 | MEDIA | Ambos | ABIERTO | Paso 9 | cliente HTTP allowlist + bloqueo IP privada |
| PF-SEC-025 | BAJA | Windows nativo | ABIERTO | Paso 2 | Helmet/CSP/HSTS; sin X-Powered-By |
| PF-SEC-026 | BAJA | Ambos | ABIERTO | Paso 12 | rotación por tamaño + cuota |
| PF-SEC-027 | BAJA | Docker | ABIERTO | Paso 12/13 | healthchecks + límites compose |
| PF-SEC-028 | INFO | Ambos | CERRADO (parcial) | — | mantener middleware + rotación de token |
| PF-SEC-029 | INFO | Ambos | CERRADO (parcial) | — | conservar pruebas de regresión |
| PF-SEC-030 | INFO | Ambos (CI) | ABIERTO | Paso 1/14 | suites vitest/pytest + CI ampliado |

## Acciones manuales pendientes (operador)

1. Ejecutar `platform/scripts/rotate-internal-secrets.ps1` (rotación interna completa; muestra credenciales del panel una vez).
2. Rotar claves externas: Pexels, MiniMax, Kimi, OpenAI, DataImpulse + relogin Instagram (checklist en `docs/SECURITY-ROTATION-2026-08-13.md`).
3. Eliminar `backups/legacy/phonefarm-export-20260811-1137.zip` tras verificar restauración con backup cifrado (paso 10).
4. Decidir sobre purga de historial git (hallazgos placeholder en commits `9da8a66`/`d5abdfe`) — requiere autorización.
