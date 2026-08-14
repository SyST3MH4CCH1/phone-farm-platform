# Auditoría de Seguridad — Phone Farm Control Center

**Fecha (revisión actual)**: 2026-08-14 — Ronda 3 de auditoría + remediación.
**Historial de rondas**:
- **Ronda 1** (2026-08-07/09): `AUDIT-001..010` — auditoría inicial + remediación estructural (ver § Ronda 1 abajo).
- **Ronda 2** (2026-08-13): `PF-SEC-001..030` — programa de remediación 0-14, postura 1/10 → **9/10** (informe detallado: [`SECURITY-AUDIT-2026-08-13.md`](SECURITY-AUDIT-2026-08-13.md)).
- **Ronda 3** (2026-08-14): `PF-SEC-031..036` — auditoría de seguimiento post-cierre, 6 hallazgos nuevos, **todos remediados en esta ronda** (detalle en la § Ronda 3).

**Estado global**: **9/10**. Los 46 hallazgos (10 + 30 + 6) están **cerrados con remediación y prueba automatizada** (38 vitest + 44 pytest en verde, typecheck PASS, npm audit 0 vulns, CI con gitleaks/bandit/pip-audit). Quedan **4 acciones manuales de operador** (ver § Acciones manuales pendientes).

---

## Resumen ejecutivo consolidado

| Ronda | Fecha | Hallazgos | Severidad | Estado |
|---|---|---|---|---|
| 1 — AUDIT-001..010 | 2026-08-09 | 10 (5 críticos, 5 altos) | CRÍTICA/ALTA | ✅ CERRADOS |
| 2 — PF-SEC-001..030 | 2026-08-13 | 30 (4 críticos, 10 altos, 10 media, 3 baja, 3 info) | CRÍTICA→INFO | ✅ CERRADOS |
| 3 — PF-SEC-031..036 | 2026-08-14 | 6 (1 alto, 3 media, 2 baja) | ALTA→BAJA | ✅ CERRADOS |

---

## Ronda 1 — Auditoría inicial (2026-08-07/09)

### Hallazgos CRÍTICOS

### AUDIT-001 — Sesión global única en Express: un usuario pisa al otro
- **Componente**: `server.ts` (antes `currentSessionUser` global)
- **CWE**: 384 / 565 / 613
- **Estado**: 🟢 **REMEDIADO 2026-08-09**.
- **Fix aplicado**: `sessions: Map<sha256(token), SessionUser>` multi-usuario con `expiresAt`. Login ya no pisa otras sesiones; limpieza automática de expiradas cada 10 min. Logout solo revoca el token actual.

### AUDIT-002 — `POST /api/auth/logout` no requiere autenticación (kill-switch global)
- **Componente**: `server.ts`
- **CWE**: 862 / 613
- **Estado**: 🟢 **REMEDIADO 2026-08-09**.
- **Fix aplicado**: logout protegido por `requireAuth` y borrado selectivo (`sessions.delete(hashToken(token))`).

### AUDIT-003 — Contraseñas en claro en `platform/accounts.json`, trackeado en git
- **Componente**: `platform/accounts.json` (campo `password` legible; el archivo estaba en `git ls-files`)
- **CWE**: 256 / 522 / 312
- **Estado**: 🟢 **REMEDIADO** (superado por el cifrado at-rest de la Ronda 2, paso 4).
  - Ronda 1: `accounts.json`, `proxies.json`, `queue.json` sacados del índice y añadidos a `.gitignore`. El historial de git nunca los commiteó.
  - Ronda 2 (paso 4): migración a SQLite con campos cifrados AES-256-GCM (`enc_password`), sesiones instagrapi cifradas, backup `.pfbackup` cifrado.
- **Acción pendiente** (operador): rotar claves externas (ver § Acciones manuales).

### AUDIT-004 — Flask (5000) NO autenticaba nada — ahora remediado
- **Componente**: `platform/phonefarm/platform.py` antes de `run()`, todos los endpoints
- **CWE**: 306 / 749
- **Estado**: 🟢 REMEDIADO + ENDURECIDO.
- **Fix aplicado**: `@app.before_request` exige `X-Internal-Auth: <token>` en todo (menos `/` y `/favicon.ico`); `server.ts` exige `PHONE_FARM_INTERNAL_TOKEN` por entorno (producción no arranca sin él).

### AUDIT-005 — El panel Express ahora exige autenticación al usuario
- **Estado**: 🟢 VERIFICADO Y ENDURECIDO 2026-08-09.
- **Fix aplicado**: `requireAuth` protege también `/engagement/*` y `/videos/*` (antes vía abierta: cualquiera podía arrancar bots o listar vídeos sin login).

### Hallazgos ALTOS

### AUDIT-006 — Comparación de credenciales con `===` (timing attack)
- **Estado**: 🟢 **REMEDIADO** — `safeEqual()` con `crypto.timingSafeEqual` en login y validación de token. En Python: `hmac.compare_digest`.

### AUDIT-007 — Token de sesión expuesto en el JSON de login
- **Estado**: 🟢 **REMEDIADO** — el body de login devuelve solo `{id, username, role, email}`; el token viaja únicamente en cookie `HttpOnly`.

### AUDIT-008 — Roles `admin`/`operator` nunca se aplican (no hay RBAC)
- **Estado**: 🟢 **REMEDIADO** — `requireRole("admin")` en mutaciones sensibles (cuentas, proxies, borrado de jobs, download-zip, source, config MPT). Ampliado y endurecido en Rondas 2 y 3 (ver PF-SEC-032/033/034).

### AUDIT-009 — `/api/download-zip` expone el estado completo (post-auth)
- **Estado**: 🟢 **REMEDIADO** — solo `admin` + redacción de `device_serial`, `session_file` y `proxy.host` en el ZIP.

### AUDIT-010 — `/api/source` expone el código fuente del backend
- **Estado**: 🟢 **REMEDIADO** — desactivado por defecto (`EXPOSE_SOURCE`); si se habilita, solo `admin`.

### Hallazgos de menor riesgo (Ronda 1) — validados y cerrados

- `SameSite=Strict` correcto en cookie; `HttpOnly` activo; fetch same-origin (sin transferencia cross-origin).
- **MCP server (5001)** sin auth — **cerrado en Ronda 2 (paso 7)**: Bearer auth + scopes + rate limit por token.
- `execFile` sin `shell: true` en todos los subprocesos (sin command injection) — revalidado en Ronda 3.
- **Escritura JSON atómica** (`os.replace`) — superada por SQLite WAL (Ronda 2, paso 3).
- Credenciales fake eliminadas del bundle; JWT/llaves ADB fuera del repo (`.gitignore`).

---

## Ronda 2 — Programa de remediación 0-14 (2026-08-13)

30 hallazgos (`PF-SEC-001..030`): 4 CRÍTICA · 10 ALTA · 10 MEDIA · 3 BAJA · 3 INFO — **todos cerrados**. Postura **1/10 → 9/10**.

Detalle completo (descripción, vector, impacto, remediación y prueba de cierre por hallazgo): [`docs/SECURITY-AUDIT-2026-08-13.md`](SECURITY-AUDIT-2026-08-13.md). Seguimiento por paso y estado por hallazgo: [`docs/SECURITY-REMEDIATION-TRACKER.md`](SECURITY-REMEDIATION-TRACKER.md).

**Soluciones aplicadas por área (resumen):**

| Área | Solución |
|---|---|
| Autenticación | Sesiones SQLite solo-hash + TTL + revocación; login contra `users` (scrypt N=2^14, timing-safe); rate limit persistente 5/15min user+IP, 20/15min IP |
| RBAC | Express + Flask (`requireRole` / `require_role`); operator: consultar/crear borradores/marcar ready; admin: aprobar, publicar, programar, engagement, login IG, credenciales; `auto_approve` eliminado |
| Cifrado at-rest | SQLite WAL; passwords en `enc_password` AES-256-GCM (AAD tabla\|id\|campo); clave maestra DPAPI/file; sesiones instagrapi cifradas; backups `.pfbackup` (scrypt→HKDF→AES-256-GCM) |
| MCP | `mcp_tokens.py` (solo hashes, expiración, scopes read/queue.write/engagement/approve/publish/admin); `BearerAuthMiddleware` (401/403/429); auditoría por tool; off por defecto |
| MoneyPrinterTurbo | `verify_token` activo (tiempo constante, fail-closed); solo `/ping` público; `x-api-key`; lock de terceros + patch reproducible; compose sin `env_file` |
| Validación/SSRF | Zod (Express) + Pydantic (Flask); rechazo de caracteres de control; egress allowlist (`net.py`/`net.ts`), bloqueo de IP privada/metadata; ADB test-connection server-side |
| Identity/Audit | X-Actor/X-Role/X-Request-ID solo loopback; cadena HMAC tamper-evident (`verify_chain`); `/internal/audit` |
| IA | Instrucciones de sistema constantes; bloqueo de secretos en prompts; validación de salida; moderación antes de `ready_for_publish` |
| Supply chain/Docker | nanoid ≥3.3.17 (0 vulns); requirements exactos; Dockerfile no-root + digest; compose cap_drop/read_only/redes separadas/healthchecks |
| CI | typecheck, build, vitest, pytest, npm audit, pip-audit, bandit, compose config, gitleaks |

---

## Ronda 3 — Auditoría de seguimiento (2026-08-14)

6 hallazgos nuevos (`PF-SEC-031..036`), **todos remediados y con test en esta ronda**. Detalle completo: [`docs/SECURITY-AUDIT-2026-08-13.md`](SECURITY-AUDIT-2026-08-13.md) § "Ronda 3".

| ID | Severidad | Hallazgo | Solución aplicada |
|---|---|---|---|
| **PF-SEC-031** | ALTA | `RedactFilter` no redactaba `record.args`: `logger.info("pass=%s", secret)` escribía el secreto en claro en logs/SSE | El filtro interpola con `getMessage()`, redacta el mensaje completo y vacía `args` (el Formatter no re-formatea). Test: `test_redact_filter_redacta_args_interpolados` |
| **PF-SEC-032** | MEDIA | `/api/adb/touch` sin `requireRole("admin")` — un operator podía controlar físicamente todos los teléfonos (tap/swipe/key/power); `/mirror` sí era admin | `requireRole("admin")` en `/api/adb/touch` (mismo criterio que mirror). El screenshot se mantiene operator por ser lectura/monitoreo |
| **PF-SEC-033** | MEDIA | `POST/DELETE /api/content/profiles` sin RBAC en Express NI Flask — operator alteraba la config global de generación (tone→prompt LLM, voice, captions) | `require_role("admin")` (Flask) + `requireRole("admin")` (Express) en POST/DELETE; GET abierto (operator selecciona nicho). Tests en pytest y vitest |
| **PF-SEC-034** | MEDIA | `/api/moneyprinter/voices` (ejecuta `edge-tts` en el host) y `/test-pexels` (oráculo de validez de la key Pexels del servidor) sin gate | `requireRole("admin")` en ambos (config MPT ya era admin-only) |
| **PF-SEC-035** | BAJA | `GET /api/moneyprinter/config` releía el fichero `.env` con `fs` en cada request (un campo futuro mal parseado filtraría secretos) | Eliminada la lectura del fichero; valores tomados de `config` (cargada de `.env` al arrancar por `loadConfig`). Contrato de API idéntico |
| **PF-SEC-036** | BAJA | `mcp_tokens.cmd_revoke` ejecutaba el UPDATE 2 veces (autocommit + transacción) con `rowcount` ambiguo; cookie malformada (`%` inválido) → HTTP 500 | Un solo UPDATE transaccional capturando su `rowcount`; `try/catch` en `parseCookies` (cookie malformada se ignora, sin 500) |

### Verificaciones sin hallazgo (Ronda 3)

- `GET /api/proxies` filtra el campo `pass`; `_account_dto` filtra `password` y `session_file` (nunca expone `enc_password`).
- `.env` y `platform/.env` no trackeados en git; `npm audit --omit=dev` → 0 vulnerabilidades; CI `audit-deps` cubre npm audit + pip-audit.
- Frontend sin `innerHTML`/`dangerouslySetInnerHTML`/`eval`; `/panda` usa `textContent` (regresión cubierta por test).
- `/api/content/preview` valida `keyword` (MAX_KEYWORD_LEN=200) — descartado hallazgo preliminar.
- `execFile` sin shell en ADB/scrcpy/edge-tts; `/api/stack` usa `exec()` con comandos fijos + PID del sistema (no explotable remotamente).

### Observaciones aceptadas por diseño (sin cambio)

- `/api/adb/screenshot/:serial` accesible a operator: monitoreo (el control es admin: touch/mirror).
- `GET /api/proxies` dispara `verify_proxy` (ipify) con cache 60 s: coste acotado, operador interno.
- `scrypt N=2^14` < OWASP 2^17: cambiar N rompe hashes existentes; requiere rehash-on-login planificado (no tocado).
- `token_is_valid` abre una conexión SQLite por llamada: ineficiencia sin impacto (rate limit MCP 60/min).

---

## Puntuación global

Postura de la auditoría más reciente (Ronda 2/3, 2026-08-13/14): **9/10** (desde 1/10 inicial).

| Área | Ronda 3 | Ronda 2 |
|---|---|---|
| Autenticación | ✅ | ✅ |
| Autorización (RBAC) | ✅ (ampliado: touch/voices/pexels/perfiles) | ✅ |
| Protección de datos | ✅ (redacción de args corregida) | ✅ |
| Frontend (XSS/CSP) | ✅ | ✅ |
| Infraestructura (Docker, TLS, bind) | ✅ | ✅ |
| Logging/forense | ✅ (PF-SEC-031) | ✅ |

---

## ¿Listo para producción?

**SÍ, con gate de acciones manuales pendientes.** Los 46 hallazgos están remediados con prueba automatizada; no hay críticas/altas abiertas aplicables. El gate del plan exige completar las 4 acciones manuales de operador antes de la liberación.

## Acciones manuales pendientes (operador)

1. Ejecutar `platform/scripts/rotate-internal-secrets.ps1` (rotación interna completa; muestra credenciales del panel una vez).
2. Rotar claves externas: Pexels, MiniMax, Kimi, OpenAI, DataImpulse + relogin Instagram (checklist: `docs/SECURITY-ROTATION-2026-08-13.md`).
3. Eliminar `backups/legacy/phonefarm-export-20260811-1137.zip` tras verificar restauración con backup cifrado.
4. Decidir sobre purga de historial git (placeholders en commits `9da8a66`/`d5abdfe`) — requiere autorización.

## Siguientes pasos recomendados

- **Corto plazo**: completar las acciones manuales del gate (rotación de claves externas, ZIP legacy, purga git).
- **Medio plazo**: subir `scrypt` a N=2^17 con rehash-on-login (PF-SEC-036 de Ronda 2 queda como mejora planificada); evaluar gestor de secretos administrado y firewall de Windows (fase 3 del plan).

## Documentos fuente

| Documento | Contenido |
|---|---|
| `docs/SECURITY-AUDIT-2026-08-13.md` | Detalle completo Rondas 2 y 3 (30 + 6 hallazgos, severidad, evidencia, remediación, pruebas de cierre) |
| `docs/SECURITY-REMEDIATION-TRACKER.md` | Programa 0-14: pasos, commits, estado por hallazgo, acciones manuales |
| `docs/SECURITY-ROTATION-2026-08-13.md` | Checklist de rotación de claves externas |
| `docs/INTERCONEXION.md` | Mapa de procesos, puertos y auth por capa |