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
