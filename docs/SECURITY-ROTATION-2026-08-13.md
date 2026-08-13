# Registro de rotación de secretos — 2026-08-13

**Política:** este documento registra *nombres* de secretos y su estado de rotación.
**Nunca** contiene valores, hashes de valores ni contenido de `.env`, `config.toml` o sesiones.
Los valores rotados por script se escriben directamente en los archivos de configuración con permisos restrictivos y **solo se muestran una vez** en la consola que ejecutó el script.

## Inventario de secretos (nombres)

### Internos (rotables localmente, sin intervención de terceros)

| Secreto | Ubicación | Estado | Notas |
|---|---|---|---|
| `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` | `.env` (raíz) | ROTADO por `rotate-internal-secrets.ps1` | Nuevos valores generados ≥32 chars. Serán sustituidos por hashes `scrypt` en BD (paso 3/5). |
| `PHONE_FARM_INTERNAL_TOKEN` | `.env` (raíz) | ROTADO por script | Debe coincidir con `INTERNAL_TOKEN` de `platform/.env`. |
| `INTERNAL_TOKEN` | `platform/.env` | ROTADO por script (sincronizado) | Token Express↔Flask. |
| `MPT_API_KEY` | `.env` + `platform/.env` (nuevo) | GENERADO por script | Clave API propia para MoneyPrinterTurbo (paso 8 la exige). |
| `adbkey` / `adbkey.pub` | `~/.android/` | PENDIENTE (decisión) | Par de claves ADB de la máquina. Regenerar solo si se sospecha exfiltración del ZIP legacy. |

### Externos (rotación manual obligatoria en el portal de cada proveedor)

| Secreto | Proveedor / portal | Estado |
|---|---|---|
| `PEXELS_API_KEY` | Pexels — https://www.pexels.com/api/ | ⏳ PENDIENTE — acción manual del operador |
| `MINIMAX_API_KEY` | MiniMax — https://platform.minimax.io | ⏳ PENDIENTE — acción manual del operador |
| `KIMI_API_KEY` | Moonshot Kimi — https://platform.moonshot.cn | ⏳ PENDIENTE — acción manual del operador |
| `OPENAI_API_KEY` | OpenAI — https://platform.openai.com | ⏳ PENDIENTE — acción manual del operador |
| `DATAIMPULSE_USER` / `DATAIMPULSE_PASS` | DataImpulse — https://dataimpulse.com | ⏳ PENDIENTE — acción manual del operador |
| Sesiones Instagram (instagrapi) | Instagram — rotar = cerrar sesión y relogin desde el panel | ⏳ PENDIENTE — tras migración a cifrado (paso 4) |

### Cómo completar la rotación externa

1. Generar la nueva clave en el portal del proveedor y **revocar la anterior**.
2. Actualizar el valor en `.env` / `platform/.env` (las claves LLM viven en `platform/.env`).
3. Reiniciar el stack: `platform/scripts/restart-all.ps1` (o `run-native.ps1`).
4. Marcar aquí el estado como `ROTADO 2026-08-13` y anotar fecha en el tracker.

## Acciones de contención ejecutadas

- [x] Publicación y servicios detenidos (puertos 3000/5000/5001/8080 sin procesos; verificado con netstat).
- [x] Inventario de nombres de secretos (este documento).
- [x] Rotación de secretos internos por script (ver `platform/scripts/rotate-internal-secrets.ps1`) — **ejecutar manualmente**: `powershell -File platform/scripts/rotate-internal-secrets.ps1` (muestra las nuevas credenciales del panel una sola vez).
- [x] Gitleaks v8.30.1 sobre el repositorio principal: **4 hallazgos, todos placeholders sin valor activo** (ejemplos de 19 chars en `MANUAL.md`, strings vacíos en `src/components/CurlTesterModal.tsx:132` y `MoneyPrinterModal.tsx:27`; ninguno coincide con los secretos de `.env`). Archivos actuales saneados; los hallazgos viven en commits históricos `9da8a66`/`d5abdfe` → **decisión pendiente del operador sobre purga de historial** (no se reescribe sin autorización).
- [x] Gitleaks sobre el checkout `platform/third_party/MoneyPrinterTurbo`: **sin hallazgos**.
- [x] ZIP legacy movido a `backups/legacy/phonefarm-export-20260811-1137.zip` (fuera de rutas de exportación).
- [x] `.env.example` sin credenciales de demostración (`admin123`/`operator123` eliminadas).
- [ ] Rotación de claves externas (ver tabla) — **acción manual del operador**.
- [ ] Eliminación manual del ZIP legacy tras verificar restauración con backup cifrado.
- [ ] Relogin de sesiones Instagram tras la migración a cifrado.
- [ ] Decisión sobre purga de historial git (hallazgos placeholder) — requiere autorización explícita.

## Notas

- No se reescribe historial git: los secretos observados vivían en archivos ignorados (`.env`, `backups/`, `platform/data/`). La rotación es por precaución, no por filtración confirmada.
- `.env.example` ya no contiene credenciales de demostración (ver commit del paso 0).
- Tras el paso 3, las credenciales del panel se almacenan como hash `scrypt` en SQLite; `.env` conserva solo el bootstrap inicial.
