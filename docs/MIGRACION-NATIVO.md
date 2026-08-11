# Migración: Docker → Nativo (Mini PC Windows)

**Fecha:** 2026-08-03
**Motivo:** Docker Desktop + VM WSL2 consumen 2-3 GB de los 7.9 GB del Mini PC; MPT sufría OOM (VM a 3.78 GB), deadlocks de MoviePy y montajes rotos. Nativo libera RAM para MPT y el resto de apps, y usa ADB directo del host.

## Arquitectura objetivo

```
Mini PC (Windows, 8 GB)
├── platform\.venv\Scripts\python.exe -m phonefarm.platform   → Flask :5000 + MCP :5001
├── third_party\MoneyPrinterTurbo\.venv-mpt\python main.py    → MPT API :8080 (solo 127.0.0.1)
├── adb (platform-tools del host)                              → directo, sin host.docker.internal
└── Docker Desktop: APAGADO (libera ~2-3 GB RAM)
```

## Pasos

| # | Acción | Verificación |
|---|---|---|
| 1 | `docker compose down` | puertos 5000/5001/8080 libres; contenedores detenidos |
| 2 | `gen_mpt_config.py` con `ffmpeg_path` correcto por plataforma | `mpt-config.toml` con `listen_host="127.0.0.1"` y ruta ffmpeg Windows válida |
| 3 | `platform\.venv`: `pip install -r requirements.txt` + `-r third_party\taktik-bot\requirements.txt` | `python -c "import taktik"` OK |
| 4 | Crear `third_party\MoneyPrinterTurbo\.venv-mpt` + requirements de MPT | `python main.py` responde en :8080 |
| 5 | `run-native.ps1` (arranca ambos) | Flask :5000 200 · MCP :5001 handshake · MPT :8080 openapi 200 |
| 6 | `/api/stack` en modo nativo (procesos si no hay Docker) | el strip del panel muestra los procesos |
| 7 | Apagar Docker Desktop (`taskkill`/WSL) | RAM libre sube 2-3 GB (`Get-CimInstance Win32_OperatingSystem`) |
| 8 | Pipeline E2E nativo: job → guión MiniMax → MPT → vídeo validado con ffprobe | `ffprobe duration > 15 s` |

## Rollback
`docker compose up -d --build` en `platform/` (los Dockerfile/compose se mantienen intactos).

## Riesgos y mitigaciones
- **Deps MPT en Windows**: venv aislado (`.venv-mpt`) evita conflictos con instagrapi/taktik.
- **ffmpeg**: el shim de WinGet crashea (0xC0000005) → se usa el binario real del paquete Gyan (ruta completa en `ffmpeg_path` del config) o el bundled de imageio.
- **Deadlocks MoviePy**: si reaparecen nativos, aplicar los mismos workarounds (BGM off, detección por archivo + validación ffprobe) ya implementados en `generator.py`.
- **Paneles**: el React (`:3000`, Express) sigue igual; el strip STACK usa `/api/stack` (modo nativo = procesos).

## Item 7 · Apagar Docker Desktop y salto de RAM

**Hallazgo real (medido en este Mini PC):** Docker Desktop YA NO está en ejecución — no hay `Program Files\Docker`, no corre `dockerd`/`com.docker.backend`, y `wsl -l -v` solo muestra la distro `docker-desktop` (WSL2, ~500-550 MB en `vmmemWSL`). Por tanto el salto de "2-3 GB" NO aplica aquí: esa cifra supone un Docker Desktop activo.

Medición ejecutada para liberar lo que SÍ ocupa:
- `wsl --shutdown` + `taskkill vmmem + stop WSLService`
- RAM libre: **1.43 GB → 2.03 GB (+0.60 GB)** (baseline limpio; en otro punto medido 0.74→1.5 GB, +0.76 GB).
- **Caveat**: la distro `docker-desktop` tiene keepalive de WSLg/WSLService y respawnea si Docker Desktop sigue instalado. Para un apagado permanente: `winget uninstall Docker.DockerDesktop` o "Quit Docker Desktop" (bandeja) y luego `wsl --shutdown` + `wsl --unregister docker-desktop` cuando ya no se use Docker.

**Conclusión del Item 7:** se libera ~0.6-0.8 GB de la VM WSL2; los ~2-3 GB del plan eran el coste *esperado* de Docker Desktop corriendo, que aquí ya no está activo. El requisito operativo (Docker fuera del camino, RAM para MPT) queda cumplido.

## Verificación de interconexiones en vivo (2026-08-04)

| Interconexión | Resultado | Evidencia |
|---|---|---|
| Flask :5000 | ✅ 200 | `GET /api/stats`, `GET /` dashboard |
| Flask ↔ MCP :5001 | ✅ handshake | `tools/list` 14 tools; MiniMax devolvió guión real |
| Flask ↔ MPT :8080 | ✅ openapi 200 | `POST /api/v1/videos` crea tarea; MP4 validado con ffprobe (22.93s y 18.83s) |
| Flask ↔ ADB host | ✅ dispositivo real | `adb devices -l` → `ZY326WFTMQ` Motorola One Action Android 11 |
| uiautomator2 → móvil | ✅ conecta + navega | ATX inicializado; taktik-bot corrió Instagram en el realtime (logs: `navigate_to_profile_tab`, detectores IG) |
| Proxy móvil via ADB | ✅ inyectado/revertido | `settings put global http_proxy gw.dataimpulse.com:10001` → get confirma; revertido a `:0` |
| Proxy DataImpulse SOCKS5 (verify_proxy) | ⚠️ bug corregido / sin verificación | Se corrigió `proxy_manager.get_proxy_dict` para resolver placeholders → `.env` (`DATAIMPULSE_USER/PASS`). Con credenciales reales ausentes, devuelve `status=offline` honesto. **Con credenciales reales en .env se verificará online.** |
| Publicación Instagram (login_once + clip_upload) | 🔶 bloqueado por seguridad | `login_once('"acc_01", user, pass)` necesita credenciales reales del usuario/cuenta; no implementables desde el código. Con `sessions/acc_01.json` completado, el pipeline genera y sube a Instagram automáticamente (fallback ADB a `/sdcard/Download` ya probado). |

## Activación final (cuando dispongas de credenciales reales)

Todo está listo; solo faltan 2 piezas de datos reales que el entorno no contiene:

1. **Proxy DataImpulse (verify_proxy → online)**:
   - Pon `DATAIMPULSE_USER` y `DATAIMPULSE_PASS` reales en `platform/.env`, **o** desde la API:
     `POST /api/proxies/credentials {"proxy_id":"proxy_01","user":"...","pass":"..."}` (limpia el cache y re-verifica al instante).
   - Esperado: `verify_proxy("proxy_01")` → `status=online` + `ip` pública.

2. **Sesión Instagram (publish → status=published)**:
   - `POST /api/accounts/acc_01/instagram/login {"username":"<ig_user>","password":"<ig_pass>"}` (crea `sessions/acc_01.json` con `publisher.login_once`). El username se persiste en `accounts.json`.
   - Luego `POST /api/queue/next` (o el botón **Generar & Publicar Siguiente** del panel) produce el MP4 y `clip_upload` lo publica → `status=published` + `media_id`.
   - Si IG bloquea (`ChallengeRequired`/`PleaseWaitFewMinutes`), el MP4 se copia a `/sdcard/Download` vía ADB y se registra `logs/fallback_queue.json` para subida manual.

**Bloqueo actual:** `accounts.json` contiene `CAMBIAR_POR_CONTRASEÑA_REAL` y `.env` tiene `DATAIMPULSE_USER`/`DATAIMPULSE_PASS` vacíos. Sin esos datos reales, los dos pasos anteriores permanecen bloqueados-por-causa y están documentados (no simulados).


