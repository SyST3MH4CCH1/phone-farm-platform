# Devtools Surface & Feature Flags — TASK §14, §17, §24

**Fecha:** 2026-10-03
**Versión:** 1.0

---

## 1. ADB Bridge — superficie real y allowlist (TASK §14)

### 1.1 Verificación de la superficie real

Inspección de `server/app.ts`:

| Endpoint | Implementación | Cumple TASK §14 |
|---|---|---|
| `GET /api/adb/devices` | `hostExec("adb", ["devices", "-l"], 8000)` — `execFile` con args fijos | ✅ |
| `POST /api/adb/test-connection` | usa Flask (allowlist) | ✅ |
| `POST /api/adb/mirror` | usa Flask (allowlist) | ✅ |
| `POST /api/adb/touch` | validación `adbTouchSchema` (coordenadas bounded) + rate limit 20/min | ✅ |
| `POST /api/adb/screenshot` | allowlist | ✅ |

**No existe** `POST /api/adb/shell` ni endpoint equivalente que tome un comando arbitrario. Confirmado por grep:

```text
grep -nE 'shell\s*\+|/api/adb/(shell|exec|run)' server/app.ts  → no matches
```

### 1.2 Prohibido por defecto

TASK §14.1: "No crear un endpoint central genérico `adb shell <cualquier cosa>`". Estado real: **NO** existe. Mantener.

### 1.3 Acciones permitidas (TASK §14.2)

- Health check → `/api/adb/devices`
- List devices → `/api/adb/devices`
- Screenshot → `/api/adb/screenshot`
- Battery → `/api/adb/battery/<serial>` (vía Flask)
- Version/model → `/api/adb/version/<serial>`
- Network info → `/api/adb/network/<serial>` (si implementado)
- Restart ADB bridge → `/api/adb/restart` (solo admin)
- Ejecutar workflows registrados → `/api/workflows/*` (definidos en `platform/workflows/`)
- Install APK → solo vía flujo validado `/api/adb/install` (futuro; no presente)
- Logs filtrados → `/api/logs` con filtro

### 1.4 Terminal interactivo

TASK §14.4: "Un `shell` interactivo solo puede existir bajo un flag de local development, desactivado por defecto y no accesible en futuros entornos remotos".

**Estado actual:** No existe terminal interactivo en la UI. No se añade en este redesign. Si en el futuro alguien quiere añadirlo, **debe** ir bajo flag `ENABLE_DEV_ADB_SHELL=true`, **solo** con `bind` loopback, **solo** admin, con banner visible, y NUNCA en SaaS/remoto.

## 2. Python Code — sin RCE por defecto (TASK §17)

### 2.1 Estado real

`src/components/CodeViewerModal.tsx` muestra archivos del backend (`platform/phonefarm/*.py`) en modo **read-only**. No ejecuta Python.

### 2.2 Política

- **Producción / default:** read-only. Sin flag, sin RCE. Confirmado por grep:
  ```text
  grep -nE 'exec\(|spawn\(|child_process' src/components/CodeViewerModal.tsx  → no matches
  ```
- **Local dev opcional:** si en el futuro alguien quiere permitir editar/ejecutar scripts, debe ir tras `ENABLE_DEV_CODE_EDITOR=true` en `process.env`/`import.meta.env`, con:
  - bind loopback (no accesible remotamente);
  - admin/dev only;
  - banner visible en la UI ("DEV CODE EDITOR — local only");
  - nunca activo en SaaS/remoto;
  - sandbox/working dir limitada a `platform/scripts/dev-*`.

### 2.3 Recomendación de implementación futura (no en este TASK)

```ts
// CodeViewerModal.tsx (futuro)
const devEditor = import.meta.env.DEV && process.env.ENABLE_DEV_CODE_EDITOR === "true";

if (!devEditor) {
  return <ReadOnlyViewer files={files} />;
}
// else: render <DevEditor /> with banner + audit log
```

El test `test/rbac.test.ts` ya cubre el camino "no RCE" porque ningún endpoint expone ejecución arbitraria de Python. Se mantiene.

## 3. cURL API Explorer — TASK §16

`src/components/CurlTesterModal.tsx` ejecuta métodos/paths contra el propio panel con la sesión del usuario.

### 3.1 Estado real

- Lista de endpoints **curada manualmente** (no derivada de OpenAPI todavía).
- Métodos y paths son hardcoded pero legítimos; el usuario solo puede invocar lo que el panel expone.
- Tokens reales **no** aparecen en el cURL copiable: usa bearer del usuario autenticado (plantilla con placeholder `${TOKEN}` si el usuario lo exporta).

### 3.2 Pendiente (no bloqueante)

Generar la lista desde `/openapi.json` cuando el backend Flask lo exponga. En este rediseño:
- No se introduce dependencia nueva.
- No se inventa OpenAPI.
- Se documenta como Fase G pendiente.

## 4. Feature flags existentes / añadidos

| Flag | Tipo | Default | Fuente | Uso |
|---|---|---|---|---|
| `NODE_ENV` | entorno | `development` | `process.env` | Habilita helmet/CSP, modo SPA. |
| `COOKIE_SECURE` | entorno | `false` | `process.env` | Cookie Secure flag. |
| `INTERNAL_TOKEN` | entorno | requerido | `process.env` | Auth Express↔Flask. |
| `MPT_API_URL` | entorno | `http://127.0.0.1:8080` | `process.env` | Base MPT. |
| `FLASK_BASE` | entorno | `http://127.0.0.1:5000` | `process.env` | Base Flask. |

### Flags pendientes (no se introducen en este TASK; documentados para futura iteración)

| Flag | Default | Propósito |
|---|---|---|
| `ENABLE_DEV_CODE_EDITOR` | `false` | Habilitar edición/ejecución Python local. |
| `ENABLE_DEV_ADB_SHELL` | `false` | Habilitar shell ADB interactivo local. |
| `ENABLE_MPT_PUBLISHING` | `false` | Habilitar cross-post MPT Upload-Post. |
| `ENABLE_OPENAPI_EXPLORER` | `false` | Derivar lista de cURL desde OpenAPI. |

## 5. Resumen de superficie peligrosa

| Endpoint / componente | Estado | Acción |
|---|---|---|
| `POST /api/accounts` | admin only + Zod schema | OK |
| `POST /api/proxies/verify` | rate limit 10/min + Zod | OK |
| `POST /api/queue/*` | requireAuth + CSRF + Zod | OK |
| `POST /api/moneyprinter/config` | admin only + rechaza `=` / `\n` (rbac.test.ts cubre) | OK |
| `POST /api/adb/touch` | rate limit 20/min + bounded coords | OK |
| `GET /api/source` | admin only | OK |
| `GET /api/download-zip` | admin only + reauth + envelope cifrado | OK |
| SSE `/api/stream/logs` | requireAuth + buffer 64 KiB | OK |
| `CurlTesterModal` | usa sesión del usuario; tokens placeholder en export | OK |
| `CodeViewerModal` | read-only | OK |
| `AdbBridgeModal` | solo allowlist, no shell arbitrario | OK |

**Ningún cambio de seguridad requerido en este redesign.** Se mantienen las guardas existentes.

---

**Fin del documento.** Siguiente: `docs/ui/UI_REDESIGN_ROLLOUT.md` (Fase H).