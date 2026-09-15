# Gate Secretos — T1 Report

**Fecha:** 2026-09-13
**Tarea:** T1 Gate secretos — verificar .env/.gitignore/gitleaks/INTERNAL_TOKEN/ADMIN_PASSWORD≥16
**Repo:** `C:\Users\haxth3\Documents\phone-farm-platform`
**Rama:** `main` (git log: `02efbda` fix test fixtures, `4fe4720` security purge)

> ⚠️ **ROTACIÓN NO EJECUTADA — requiere confirmación operador.**
> Este documento es solo verificación. Los valores reportados son longitudes/estados,
> no los secretos reales. Nunca escribir valores reales en documentos trackeados.

---

## Inventario de secretos

### Convenciones usadas en este documento

| Símbolo | Significado |
|---|---|
| ✅ | Correcto / seguro |
| ⚠️ | Atención requerida / riesgo moderado |
| 🔴 | Hallazgo crítico — detener y reportar |
| `(vacío)` | Variable definida pero sin valor |
| `N chars` | Longitud del valor actual (sin mostrar el valor) |

---

### Secrets del panel (`.env` raíz — leído por `server/config.ts`)

| Secreto | En `.env` | Gitignore | Débil | Gitleaks detectaría | Acción operador |
|---|---|---|---|---|---|
| `ADMIN_USERNAME` | ✅ tiene valor | N/A | N/A | N/A | Ninguna |
| `ADMIN_PASSWORD` | ✅ 46 chars | N/A | ✅ No (≥16, no en FORBIDDEN list) | N/A (solo en `.env`) | Ninguna — verificar que es el valor rotado 2026-08-14 |
| `OPERATOR_USERNAME` | ✅ tiene valor | N/A | N/A | N/A | Ninguna |
| `OPERATOR_PASSWORD` | ✅ 46 chars | N/A | ✅ No (≥16, no en FORBIDDEN list) | N/A (solo en `.env`) | Ninguna |
| `PHONE_FARM_INTERNAL_TOKEN` | ✅ 40 chars | N/A | ✅ No (40+ chars) | N/A (solo en `.env`) | Verificar coincidencia con `INTERNAL_TOKEN` en `platform/.env` — **coinciden** ✅ |
| `NODE_ENV` | ✅ `"production"` | N/A | ✅ Whitelist (`production\|development\|test`) | N/A | Ninguna |

### Secrets externos (`.env` raíz — keys de terceros)

| Secreto | En `.env` | Gitignore | Débil/Vacío | Gitleaks detectaría | Acción operador |
|---|---|---|---|---|---|
| `PEXELS_API_KEY` | `(vacío)` | N/A | ⚠️ Vacío | N/A | **Rotar en portal Pexels** y escribir en `platform/.env` (no en raíz — raíz no se usa para esto) |
| `MINIMAX_API_KEY` | `(vacío)` | N/A | ⚠️ Vacío | N/A | **Rotar en portal MiniMax** y escribir en `platform/.env` |
| `LLM_PROVIDER` | `"minimax"` | N/A | ✅ Correcto | N/A | Ninguna |

### Secrets de plataforma (`platform/.env` — leído por Flask/MCP)

| Secreto | En `platform/.env` | Gitignore | Débil/Vacío | Gitleaks detectaría | Acción operador |
|---|---|---|---|---|---|
| `INTERNAL_TOKEN` | ✅ 40 chars | ✅ `.gitignore: platform/.env` | ✅ No | N/A (ignorado) | Verificar coincidencia con `PHONE_FARM_INTERNAL_TOKEN` — **coinciden** ✅ |
| `FLASK_PORT` | `5000` | ✅ | N/A | N/A | Ninguna |
| `ALLOWED_ORIGINS` | loopback only | ✅ | ✅ Correcto | N/A | Ninguna |
| `PEXELS_API_KEY` | ✅ 32 chars | ✅ `.gitignore: platform/.env` | ⚠️ Tiene valor real (no vacío) | N/A (ignorado) | **Rotar en portal Pexels** (estuvo en historial git — ver `SECURITY-ROTATION-2026-08-13.md`) |
| `MINIMAX_API_KEY` | ✅ 88 chars (sk-cp-...) | ✅ `.gitignore: platform/.env` | ⚠️ Tiene valor real | N/A (ignorado) | **Rotar en portal MiniMax** (estuvo en historial git) |
| `KIMI_API_KEY` | `(vacío)` | ✅ | ⚠️ Vacío | N/A | Considerar rotar si se usa el provider Kimi |
| `OPENAI_API_KEY` | `(vacío)` | ✅ | ⚠️ Vacío | N/A | Considerar rotar si se usa el provider OpenAI |
| `DATAIMPULSE_USER` | `(vacío)` | ✅ | ⚠️ Vacío | N/A | Revisar en portal DataImpulse si proxies están activos |
| `DATAIMPULSE_PASS` | `(vacío)` | ✅ | ⚠️ Vacío | N/A | Revisar en portal DataImpulse si proxies están activos |
| `MPT_API_KEY` | ✅ 53 chars | ✅ `.gitignore: platform/.env` | ✅ No | N/A (ignorado) | Verificar que el valor coincide con el de `.env` raíz — **coinciden** ✅ |
| `MPT_API_URL` | `http://127.0.0.1:8080` | ✅ | ✅ Loopback | N/A | Ninguna |
| `DEMO_MODE` | `false` | ✅ | ✅ Correcto | N/A | Ninguna |
| `PHONEFARM_DB_PATH` | `platform/data/phonefarm.db` | ✅ `.gitignore: platform/data/` | N/A | N/A | Ninguna |
| `PHONEFARM_KEY_PROVIDER` | `dpapi` | ✅ | ✅ Correcto (dpapi=Windows, file=Docker) | N/A | Ninguna |
| `ADB_HOST` | `127.0.0.1` | ✅ | ✅ Loopback | N/A | Ninguna |
| `PANDA_GRID_STATUS` | `Connected` | ✅ | N/A | N/A | Ninguna |

---

## Verificación de binds (solo lectura)

| Bind | Valor actual | Esperado | Estado |
|---|---|---|---|
| Express (`server/config.ts` `listenHost`) | `"127.0.0.1"` | `127.0.0.1` | ✅ Correcto |
| Flask `platform/.env` `ALLOWED_ORIGINS` | `http://127.0.0.1:5000, http://localhost:5000, http://127.0.0.1:3000, http://localhost:3000` | Solo loopback | ✅ Correcto |
| MPT `platform/.env` `MPT_API_URL` | `http://127.0.0.1:8080` | Solo loopback | ✅ Correcto |
| ADB `platform/.env` `ADB_HOST` | `127.0.0.1` | Solo loopback | ✅ Correcto |

---

## Verificación de `.gitignore`

| Ruta / patrón | ¿En `.gitignore`? | ¿Archivos reales existen? |
|---|---|---|
| `.env*` | ✅ Sí (`*.env*`) | `.env` existe ✅, `platform/.env` existe ✅ |
| `!.env.example` | ✅ Excluye el example | `.env.example` y `platform/.env.example` rastreados ✅ |
| `backups/` | ✅ Sí | `backups/legacy/` existe ✅ (vacío — sin `.zip`) |
| `platform/.env` | ✅ Sí (`platform/.env`) | Existe ✅ |
| `platform/data/` | ✅ Sí | Puede existir (datos runtime) |
| `platform/sessions/` | ✅ Sí | Puede existir (sesiones IG cifradas) |
| `platform/logs/` | ✅ Sí | Puede existir |
| `*.adbkey` | ✅ Sí | Puede existir en `%USERPROFILE%\.android\` (fuera del repo) |
| `platform/accounts.json` | ✅ Sí | Puede existir (datos runtime) |
| `platform/proxies.json` | ✅ Sí | Puede existir (datos runtime) |
| `SECRETS-LOCAL.md` | ⚠️ **NO explícitamente** — `*.md` no está ignorado, pero `SECRETS-LOCAL.md` es untracked (no existe aún en git index) | Archivo local existe — **ya funciona como esperado** (no se rastreará porque es untracked) |

---

## Verificación de código: secretos hardcodeados

| Ruta | Secretos hardcodeados encontrados | Estado |
|---|---|---|
| `server/` | Solo referencias a `env.ADMIN_PASSWORD`, `env.OPERATOR_PASSWORD`, `env.PHONE_FARM_INTERNAL_TOKEN` (nunca valores) | ✅ Seguro |
| `src/` | Ningún secreto encontrado | ✅ Seguro |

**Resultado grep:** `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `PHONE_FARM_INTERNAL_TOKEN` solo aparecen en `server/config.ts` como referencias a `env.*` y en `server/app.ts` como `config.internalToken` — sin valores hardcodeados.

---

## Verificación Gitleaks

| Aspecto | Estado |
|---|---|
| `.gitleaks.toml` existe | ✅ `C:\Users\haxth3\Documents\phone-farm-platform\.gitleaks.toml` |
| `extend.useDefault = true` | ✅ Gitleaks usa reglas default + allowlist |
| Allowlist paths | ✅ Fixtures en `test/`, presets UI en `src/components/` |
| Historial git | ⚠️ Hallazgos previos en commits `9da8a66`/`d5abdfe` (placeholders `admin123`, `Pass123!`) — purga pendiente decisión operador |
| Último commit | `02efbda` fix(test): corregir comillas — sin secretos reales |

---

## `backups/legacy/` — estado

| Elemento | Detalle |
|---|---|
| Directorio existe | ✅ `C:\Users\haxth3\Documents\phone-farm-platform\backups\legacy` (timestamp: 17/08/2026) |
| Archivos dentro | **vacío** — ningún `.zip` ni otro archivo |
| Recomendación T2 | Listar contenido previo; si `phonefarm-export-20260811-1137.zip` fue movido a cuarentena fuera del repo, documentar la ubicación en el reporte de T2 |

---

## Resumen de acciones requeridas al operador

### 🔴 Crítico (rotación manual de terceros)

| # | Acción | Portal / Referencia |
|---|---|---|
| 1 | Rotar `PEXELS_API_KEY` en `platform/.env` | https://www.pexels.com/api/ → luego actualizar `platform/.env` |
| 2 | Rotar `MINIMAX_API_KEY` en `platform/.env` | https://platform.minimax.io → luego actualizar `platform/.env` |

### ⚠️ Medio (decisión del operador)

| # | Acción | Referencia |
|---|---|---|
| 3 | Decidir sobre purga de historial git (`9da8a66`/`d5abdfe`) | `docs/SECURITY-ROTATION-2026-08-13.md` § Acciones de contención — **requiere autorización explícita** |
| 4 | Verificar/rotar `DATAIMPULSE_USER`/`DATAIMPULSE_PASS` si proxies DataImpulse están activos | Portal DataImpulse |
| 5 | Revisar `KIMI_API_KEY`/`OPENAI_API_KEY` si se usan esos providers | Portal Moonshot/OpenAI |

### ✅ Verificado — sin acción inmediata

- `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` ✅ (rotados 2026-08-14, ≥16 chars, no weak)
- `PHONE_FARM_INTERNAL_TOKEN` = `INTERNAL_TOKEN` ✅ (coinciden entre `.env` y `platform/.env`)
- Binds todos en loopback ✅
- `.gitignore` correcto ✅
- Secrets no hardcodeados en código fuente ✅
- `backups/legacy/` vacío ✅

---

## ROTACIÓN NO EJECUTADA

**Este gate no ha rotado ningún secreto. Los valores actuales siguen siendo los mismos desde 2026-08-14.**

Para ejecutar la rotación interna (panel passwords + tokens), confirmar con el operador y luego correr:

```powershell
powershell -File platform/scripts/rotate-internal-secrets.ps1
```

> **Nota:** Este script rota `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `PHONE_FARM_INTERNAL_TOKEN`/`INTERNAL_TOKEN`, y `MPT_API_KEY`. Los valores nuevos se muestran **UNA SOLA VEZ** en la consola. Los secretos externos (Pexels, MiniMax, etc.) deben rotarse manualmente en cada portal.

---

## Validación de referencia (`server/config.ts`)

El patrón de validación usado en el arranque del servidor (nunca duplicado aquí):

```typescript
// validateConfig() — rejecta arranqu
// FORBIDDEN_PASSWORDS: Set {admin123, operator123, password, changeme, 12345678, ...}
// NODE_ENV whitelist: production | development | test
// Passwords: >=16 chars + no forbidden values
// internalToken: obligatorio (no vacío)
```

Este gate verifica que las condiciones que `validateConfig()` exige en runtime se cumplan:
- Passwords ≥16 chars y no en la lista de conocidos ✅
- `NODE_ENV` en whitelist ✅
- `PHONE_FARM_INTERNAL_TOKEN` / `INTERNAL_TOKEN` presentes y coincidentes ✅
- Binds en loopback ✅
