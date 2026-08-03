# Auditoría — Phone Farm Platform

**Fecha:** 2026-08-03
**Versión auditada:** estado inicial (pre-git, generado desde plantilla AI Studio "react-example")
**Estado:** ✔ remediado · 🔶 parcial / roadmap · ✖ pendiente

---

## 1. Resumen ejecutivo

`phone-farm-platform` es un **Phone Farm Control Center**: dashboard React 19 + Vite + Tailwind 4 con backend Express + Gemini AI para gestionar cuentas de Instagram/TikTok en dispositivos Android vía ADB, proxies SOCKS5, cola de generación de contenido (MoneyPrinterTurbo) y logs en vivo.

**Conclusión:** el código es funcional como prototipo/maqueta, pero **todos los procesos "reales" están simulados** (publicación, ADB, MoneyPrinterTurbo, métricas) y el backend tenía **fallos de seguridad críticos** (credenciales hardcodeadas, bypass de autenticación, tokens sin validar). No existía control de versiones, tests ni CI.

---

## 2. Hallazgos críticos — Seguridad

### 2.1 Credenciales hardcodeadas `server.ts`
- 🔴 Admin `admin/admin123` y `phonefarm2026`, operator `operator/operator123` en el código fuente (`server.ts:188-190`).
- ✔ **Remediado:** credenciales movidas a variables de entorno (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`). En producción (`NODE_ENV=production`) el arranque falla si no están definidas. En dev se mantienen los valores de demo con un `WARN` en logs.

### 2.2 Bypass de autenticación `server.ts:190`
- 🔴 Cualquier usuario + contraseña de ≥4 caracteres iniciaba sesión como `operator`.
- ✔ **Remediado:** se eliminó la condición; solo se autentican credenciales válidas.

### 2.3 Tokens de sesión sin validar
- 🔴 El login generaba un token que **ningún endpoint validaba**: toda la API era accesible sin autenticación.
- ✔ **Remediado:** sesión por **cookie `httpOnly` + `SameSite=Strict`** (`pf_session`) + middleware `requireAuth` que protege todas las rutas `/api/*` (excepto `login`, `me` y el stream SSE). También acepta `Authorization: Bearer <token>` para clientes API/MCP.

### 2.4 Bypass de login en el cliente `LoginScreen.tsx:37-50`
- 🔴 Si la llamada al servidor fallaba, el frontend autenticaba localmente con un token falso ("sandbox fallback").
- ✔ **Remediado:** el fallback se eliminó; si el servidor no responde se muestra error.

### 2.5 API key de Pexels hardcodeada `server.ts:137`
- 🔴 Key de respaldo en el código fuente.
- ✔ **Remediado:** solo se lee de `PEXELS_API_KEY` (env). Sin key, la prueba devuelve `sandboxed_fallback` con log `WARN`.

### 2.6 Contraseñas de cuentas en texto plano
- 🔶 Cuentas mock con `password` en memoria y en `src/data.ts`.
- 🔶 **Parcial:** `GET /api/accounts` ya no devuelve el campo `password` (se conserva internamente para el mock). La persistencia real con hashing requiere una base de datos — ver roadmap (§6).

### 2.7 Otros
- ✔ **Remediado:** rate limiting en `/api/auth/login` (10 intentos / 15 min por IP → `429`).
- ✔ Servidor escucha en `0.0.0.0` (necesario para la farm) pero ahora exige sesión válida en toda la API.
- ✖ Pendiente: HTTPS (requiere reverse proxy/dominio — fuera de alcance local).
- ✔ Sin CORS abierto: la app se sirve del mismo origen (Vite middleware / estáticos).

---

## 3. Correctitud — los "módulos reales" son simulados

| Módulo | Estado | Detalle |
|---|---|---|
| Publicación ADB | 🔶 Mock | `setTimeout` marca el job como `published`; no hay envío real a Instagram/TikTok |
| Detección de dispositivos ADB | 🔶 Mock | Los "2 dispositivos detectados" están hardcodeados (`server.ts:599-602`) |
| Pipeline MoneyPrinterTurbo | 🔶 Mock | Descarga, TTS y FFmpeg son logs; nunca se ejecuta el pipeline real |
| Métricas CPU/RAM | 🔶 Mock | Valores aleatorios (`server.ts:355-356`) |
| Persistencia | ✖ Ninguna | Todo el estado en memoria; se pierde al reiniciar |
| Prueba de proxy | 🔶 Parcial | Hace fetch real a `api.ipify.org` (sin pasar por el proxy) pero los fallos se simulan como "online" |

> El frontend lo dice con honestidad: la UI está etiquetada "v2.4 REAL" y usa `use_real_flask: false` por defecto. El diseño deja claros los puntos de integración para conectar el backend real (Flask/ADB).

## 4. Bugs de correctitud

- ✔ **Colisión de IDs:** `POST /api/accounts` usaba `accounts.length+1` — tras eliminar una cuenta, el nuevo ID podía repetirse. Ahora usa contador monotónico.
- ✔ **Niveles de log inconsistentes:** el servidor emite `WARN` pero el tipo TS del frontend declaraba `WARNING`. Unificado en `WARN`.
- ✔ **SSE duplicado:** el stream reenviaba el último log cada 4s. Ahora solo emite logs nuevos (seguimiento por ID).
- ✔ **`/api/auth/me` y logout:** el logout ahora invalida la sesión del servidor y borra la cookie.

## 5. Higiene del repositorio

- ✔ **Remediado:** `package.json` se llamaba `react-example` (plantilla AI Studio) → ahora `phone-farm-platform`.
- ✔ **Remediado:** README era el boilerplate de AI Studio con instrucciones incorrectas → README propio.
- ✔ **Remediado:** no era repositorio git → inicializado con commit inicial.
- ✔ **Remediado:** sin CI → workflow GitHub Actions (typecheck + build + gitleaks).
- ✔ **Remediado:** `tsconfig` sin `strict` → habilitado.
- ✖ Pendiente: no hay tests unitarios ni e2e (roadmap §6).

## 6. Roadmap (trabajo futuro)

1. **Persistencia real:** base de datos (Postgres + Drizzle, como AI-search/MyOwnClone) para cuentas, cola y logs.
2. **Backend ADB real:** conectar con el Flask bridge (`mini_pc_ip:5000`) o ejecutar `adb` directamente; eliminar los dispositivos hardcodeados.
3. **MoneyPrinterTurbo real:** invocar el pipeline HTTP de `localhost:8501` en vez de simular.
4. **Hashing de contraseñas** (bcrypt/argon2) y roles con permisos reales.
5. **Tests:** vitest para la API (superagent/supertest) + Playwright e2e del panel.
6. **HTTPS** vía reverse proxy (Caddy/Tailscale, patrón `ops/` de MyOwnClone).
