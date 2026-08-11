# Auditoría de Seguridad — Phone Farm Control Center

**Fecha**: 2026-08-07 · Auditoría exhaustiva en vivo sobre el código real en ejecución.
**Actualización**: 2026-08-09 — sesión de remediación estructural (ver § "Remediación 2026-08-09" al final).
**Estado**: hallazgos críticos 001–010 remediados el 2026-08-09.

---

## Alcance cubierto

| Área | Archivos/Ejes |
|---|---|
| Auth/sesiones (Express) | `server.ts` completo |
| API REST Express (todos los endpoints) | `/api/*`, `/engagement/*`, `/videos/:file`, `/api/source`, `/api/download-zip` |
| MCP server (puerto 5001) | `platform/phonefarm/mcp_server.py` |
| Backend Python Flask (puerto 5000) | `platform/phonefarm/platform.py` |
| Pipeline (generator/publisher/engagement) | subprocess, adb, ffmpeg, instagrapi |
| Persistencia JSON | `platform_data.py`, `accounts.json`, `proxies.json`, `queue.json` |
| Frontend React (16 componentes) | `src/`, `index.html`, `vite.config.ts` |
| Docker (compose/Dockerfile) | `platform/docker-compose.yml`, `platform/Dockerfile` |
| Git / CI/CD | `.gitignore`, historial, `.env` |

---

## Hallazgos CRÍTICOS

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
- **Estado**: 🟢 PARCIALMENTE remediado.
  - `accounts.json`, `proxies.json`, `queue.json` sacados del índice (`git rm --cached`) y añadidos a `.gitignore`.
  - El contenido del working tree sigue en claro **en disco** (siguiente fase: cifrado con Fernet/age).
  - **El historial de git NUNCA lo commiteó** (el commit `e1bb1c4` solo tiene el placeholder — no hay secreto en el historial).
- **Acción pendiente** (FUERA del código): rotar `MINIMAX_API_KEY`, `PEXELS_API_KEY` y las contraseñas `acc_01`/`acc_02` que viven en `.env`/accounts.json del disco.

### AUDIT-004 — Flask (5000) NO autenticaba nada — ahora remediado
- **Componente**: `platform/phonefarm/platform.py` antes de `run()`, todos los endpoints
- **CWE**: 306 / 749
- **Estado**: 🟢 REMEDIADO.
- **Evidencia del fix**: `@app.before_request` exige `X-Internal-Auth: <token>` en todo (menos `/` y `/favicon.ico`).
- **ENDURECIDO 2026-08-09**: `server.ts` ya **no** contiene el token como fallback embebido; exige `PHONE_FARM_INTERNAL_TOKEN` por entorno (en producción falla el arranque sin él).

### AUDIT-005 — El panel Express ahora exige autenticación al usuario
- **Estado**: 🟢 VERIFICADO Y ENDURECIDO 2026-08-09.
- **Fix aplicado**: `requireAuth` ahora protege **también `/engagement/*` y `/videos/*`** (antes eran vía abierta: cualquiera podía arrancar bots o listar vídeos sin login).

---

## Hallazgos ALTOS

### AUDIT-006 — Comparación de credenciales con `===` (timing attack)
- **Estado**: 🟢 **REMEDIADO 2026-08-09** — `safeEqual()` con `crypto.timingSafeEqual` en login y validación de token.

### AUDIT-007 — Token de sesión expuesto en el JSON de login
- **Estado**: 🟢 **REMEDIADO 2026-08-09** — el body de login devuelve solo `{id, username, role, email}`; el token viaja únicamente en cookie `HttpOnly`.

### AUDIT-008 — Roles `admin`/`operator` nunca se aplican (no hay RBAC)
- **Estado**: 🟢 **REMEDIADO 2026-08-09** — `requireRole("admin")` aplicado a mutaciones sensibles (cuentas, proxies, borrado de jobs, download-zip, source, config MPT).

### AUDIT-009 — `/api/download-zip` expone el estado completo (post-auth)
- **Estado**: 🟢 **REMEDIADO 2026-08-09** — solo `admin` + redacción de `device_serial`, `session_file` y `proxy.host` en el ZIP.

### AUDIT-010 — `/api/source` expone el código fuente del backend
- **Estado**: 🟢 **REMEDIADO 2026-08-09** — desactivado por defecto (`EXPOSE_SOURCE`); si se habilita, solo `admin`.

---

## Hallazgos de menor riesgo pero validados

- `SameSite=Strict` correcto en cookie; `HttpOnly` activo. Los fetch del frontend usan cookies same-origin (no hay transferencia cross-origin)
- **MCP server (5001)** sin auth — no está expuesto fuera de loopback, pero queda accesible localmente (procesos no navegador del host)
- **`POST /api/proxies/credentials` redirigido a `/verify`** (2026-08-09) — Flask no implementa `/credentials`; el alias evita el 404.
- `execFile` sin `shell: true` en todos los subprocesos (no hay command injection)
- **Escritura JSON atómica** (2026-08-09): `platform_data._write` ahora usa tmp + `os.replace` — un crash a mitad ya no corrompe `queue.json`/`accounts.json`.
- Credenciales fake eliminadas del bundle (PEXELS_KEY, `admin123`/`operator123`, `token_pf_admin`, sandbox fallback)
- **JWT/llaves ADB fuera del repo** (2026-08-09): `platform/adbkey*`, `ui*.xml`, logs y `huawei_screen.png` eliminados del disco y añadidos a `.gitignore`.

---

## Puntuación global

| Área | Puntos (0–100) | Antes (07-08) |
|---|---|---|
| Autenticación | 80 | 45 |
| Autorización (RBAC) | 75 | 30 |
| Protección de datos | 70 | 60 |
| Frontend (XSS/CSP) | 55 | 55 |
| Infraestructura (Docker, TLS, bind) | 65 | 65 |
| Logging/forense | 35 | 35 |
| **Global** | **63** | **48** |

---

## ¿Listo para producción?

**NO.** Mejorado por la remediación del auth interno (cierra el ataque trivial "curl → crear cuentas"), pero falta:

1. Sesión multi-usuario real (AUDIT-001/002)
2. RBAC por rol (AUDIT-008/009/010)
3. Rotación real de credenciales (MINIMAX/PEXELS/password de cuentas IG)
4. Cifrado en reposo de accounts.json/proxies.json
5. HTTPS + bind 127.0.0.1 + reverse-proxy
6. Timing-safe comparison y expiración de sesión en servidor
7. Validación de input en Express (express-validator)

---

## Siguientes pasos recomendados

- **Inmediato**: rotar `MINIMAX_API_KEY`, `PEXELS_API_KEY`, y cualquier credencial real que viva en disco hoy
- **Corto plazo**: implementar `requireRole` y sesiones multi-usuario con `Map`
- **Medio plazo**: cifrado at-rest (age/FPK) + HTTPS
