# Migración a máquina con GPU dedicada y más RAM

**Fecha:** 2026-08-11 · **Origen:** Mini PC (Windows, 8 GB RAM, sin GPU) · **Destino:** máquina Windows con GPU dedicada (NVIDIA) y 16–32 GB RAM.

> Este runbook cubre TODO: requisitos, instalación, datos, verificación y rollback. Sigue el orden; cada sección tiene su comprobación.

---

## 1. Por qué migrar (qué mejora)

| Capacidad | Mini PC actual | Nueva máquina | Efecto |
|---|---|---|---|
| RAM | 8 GB | 16–32 GB | MoneyPrinterTurbo + ffmpeg + bots sin OOM; más jobs en paralelo |
| GPU | sin GPU | NVIDIA dedicada | ffmpeg con **NVENC** (h264_nvenc) → render de reels 5–10× más rápido |
| CPU | saturada (load > 40) | moderna | screencap/ADB dejan de colgarse (el bug del Redmi era saturación) |
| Almacenamiento | disco lento | NVMe | vídeos grandes más rápidos |

---

## 2. Requisitos previos (instalar en la máquina nueva)

| Software | Versión | Por qué / cómo |
|---|---|---|
| **Windows 11** | 22H2+ | plataforma objetivo |
| **Python** | 3.12 x64 | `winget install Python.Python.3.12` (marca "Add to PATH") |
| **Node.js** | ≥ 20 | `winget install OpenJS.NodeJS.LTS` |
| **Git** | último | `winget install Git.Git` |
| **ADB platform-tools** | último | `winget install Google.PlatformTools` o descarga zip → añadir a PATH |
| **scrcpy** | 4.x | descarga zip → `scrcpy.exe` a una carpeta en PATH (o `SCRCPY_EXE` en `.env`) |
| **ffmpeg Gyan** | full_build | `winget install Gyan.FFmpeg` — el build **full** incluye NVENC. Verificar: `ffmpeg -hide_banner -encoders \| findstr nvenc` |
| **NVIDIA driver** | Game Ready/Studio | habilita NVENC; `nvidia-smi` debe responder |
| **Docker Desktop** | solo si usas deploy.ps1 | opcional (la farm nativa no lo necesita) |

**Comprobación:**
```powershell
python --version ; node --version ; adb version ; scrcpy --version
ffmpeg -hide_banner -encoders | findstr nvenc     # → h264_nvenc, hevc_nvenc...
nvidia-smi                                        # → GPU + driver OK
```

---

## 3. Despliegue del código (portable — ya no hay rutas fijas)

### 3A. Despliegue AUTOMÁTICO (recomendado — un solo comando)

```powershell
git clone git@github.com:SyST3MH4CCH1/phone-farm-platform.git
cd phone-farm-platform
powershell -ExecutionPolicy Bypass -File platform\scripts\setup-new-machine.ps1
```

El script `setup-new-machine.ps1` hace TODO automáticamente:

| Paso | Qué hace |
|---|---|
| 0. Pre-check | Verifica git, node, npm, adb, ffmpeg, python, scrcpy |
| 1. .env | Copia `.env.example` → `.env` y `platform/.env.example` → `platform/.env`; **genera y sincroniza el token interno** si quedaron vacíos |
| 2. npm | `npm install` (panel React + Express) |
| 3. Stack Python | `run-native.ps1` (auto-detecta Python, crea venvs, instala `requirements.txt` pinned, genera config MPT) |
| 4. Datos | Si pasas `-ImportZip C:\ruta\phonefarm-export-*.zip` → descomprime sobre `platform/` (cuentas, proxies, cola, sesiones IG, vídeos) |
| 5. Express | Arranca el panel en `http://127.0.0.1:3000` |
| 6. Verificación | Comprueba Flask :5000, Express :3000, `/panda` y cuenta los dispositivos ADB |

**Después del script** solo queda: abrir el panel, editar `MINIMAX_API_KEY`/`PEXELS_API_KEY` en `platform/.env` (si no los copiaste antes) y conectar los teléfonos por USB.

> Nota: el script muestra advertencias si `ffmpeg`/`scrcpy` no están en PATH — instálalos
> antes con `winget install Gyan.FFmpeg` y descargando scrcpy (ver sección 2).

### 3B. Despliegue manual (si prefieres control total)

```powershell
# 1. Clona el repo (o copia la carpeta completa)
git clone <tu-repo> phone-farm
cd phone-farm

# 2. Crea los .env desde los ejemplos
Copy-Item .env.example .env
Copy-Item platform\.env.example platform\.env

# 3. Edita .env (raíz): credenciales + token interno
#    PHONE_FARM_INTERNAL_TOKEN=<genera uno>  →  python -c "import secrets; print(secrets.token_urlsafe(32))"
#    ADMIN_PASSWORD / OPERATOR_PASSWORD

# 4. Edita platform\.env:
#    INTERNAL_TOKEN=<el MISMO de arriba>
#    (PHONE_FARM_DATA_DIR opcional: si lo omites, los datos viven en platform/)

# 5. Arranque completo (auto-detecta Python 3.12, crea venvs, genera config MPT)
powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1

# 6. Panel web
bun install    # o npm install
bun run dev    # → http://127.0.0.1:3000   (login admin/lo que definiste)
```

> El script `run-native.ps1` ahora auto-detecta Python (py -3.12 → python → C:\Python312).
> `requirements.txt` está **pinned** con las versiones probadas (incluye taktik-bot desde git).

---

## 4. Importar los datos de la farm actual

```powershell
# En la máquina ORIGEN (Mini PC) — genera phonefarm-export-YYYYMMDD-HHmm.zip
powershell -ExecutionPolicy Bypass -File platform\scripts\export-data.ps1

# Copia el ZIP a la máquina nueva y descomprímelo SOBRE platform/
# → platform/accounts.json, proxies.json, queue.json, content_profiles.json,
#   sessions/ (cookies IG), logs/workflows/, videos/
```

**Después de importar:**
1. Conecta los teléfonos por USB → `adb devices` (acepta el diálogo de depuración en cada uno).
2. `adb reconnect` si algún serial no responde.
3. Revisa `GET /api/adb/devices` en el panel → deben aparecer todos.
4. Las sesiones IG de `sessions/` se reutilizan tal cual (instagrapi).

> ⚠️ Si un dispositivo no responde al `input` (como el Redmi sin root en origen), prueba
> `adb reconnect` o usa el botón **Manejar (scrcpy)** del panel Panda.

---

## 5. Activar GPU (NVENC) para generación de vídeo

El código ya busca ffmpeg de forma portable (`FFMPEG_PATH` → PATH → WinGet Gyan).
Para forzar NVENC en la nueva máquina:

```powershell
# 1. Verifica que el build de ffmpeg tiene NVENC (sección 2)
ffmpeg -hide_banner -encoders | findstr nvenc

# 2. Apunta FFMPEG_PATH al binario real (solo si no está en PATH)
#    En platform\.env:  FFMPEG_PATH=C:\ruta\a\ffmpeg.exe

# 3. (Opcional) MPT ya genera con ffmpeg; con GPU se acortan los tiempos de
#    render y puedes subir los jobs simultáneos en el panel MoneyPrinter.
```

Si MPT usa sus propios parámetros ffmpeg (`config.toml` de MoneyPrinterTurbo),
se regenera al arrancar con `run-native.ps1` (usa `gen_mpt_config.py`).

---

## 6. Verificación end-to-end (checklist)

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | `run-native.ps1` termina sin errores | "=== Listo ===" |
| 2 | Puertos: 5000, 5001, 8080, 3000, 5037 | todos LISTENING |
| 3 | `http://127.0.0.1:3000` → login | entra con admin |
| 4 | Header → **Panda: N conectados** | N = teléfonos visibles en `adb devices` |
| 5 | Abrir Panda → pantallas en vivo (screencap) | PNG refrescando ~1.2 s |
| 6 | Botón **Manejar (scrcpy)** | abre ventana con control táctil |
| 7 | Sidebar → MoneyPrinter → "Generar" | job pasa por scripting→generating→preview |
| 8 | Sidebar → Proxies → verificar | verificación OK (ipify vía proxy) |
| 9 | `GET /api/stack` | mode native, mpt_online, flask_online |
| 10 | Un job completo publicado (o awaiting_manual_upload) | pipeline 3-etapas funciona |

---

## 7. Datos de referencia (dónde vive cada cosa)

| Dato | Ruta (portable) |
|---|---|
| Cuentas IG | `platform/accounts.json` |
| Proxies | `platform/proxies.json` |
| Cola de jobs | `platform/queue.json` |
| Perfiles de contenido | `platform/content_profiles.json` |
| Sesiones/cookies IG | `platform/sessions/` |
| Workflows de bots | `platform/logs/workflows/` |
| Vídeos generados | `platform/videos/` |
| Claves ADB (host) | `%USERPROFILE%\.android\adbkey` (se regeneran al conectar) |

> Los `platform/data/*.json` son **solo Docker** — no tocar en modo nativo.

---

## 8. Rollback (volver al Mini PC)

1. En la nueva máquina: `platform\scripts\run-native.ps1 -Stop`.
2. Copia `phonefarm-export-*.zip` de vuelta (o exporta desde la nueva).
3. En el Mini PC: descomprime sobre `platform/` y `run-native.ps1`.
4. Los cambios de código son compatibles (todo portable desde 2026-08-11).

---

## 9. Notas de la GPU/RAM (recomendaciones)

- **Jobs en paralelo:** con 16 GB+ puedes subir `max_concurrent`/jobs simultáneos en MoneyPrinterTurbo sin OOM (en el Mini PC de 8 GB se limitaba a 1-2).
- **NVENC:** reduce el render de un reel de minutos a segundos; libera la CPU para ADB/screencap (elimina los cuelgues de pantalla vistos en el origen).
- **scrcpy con GPU:** la ventana de espejo consume menos CPU; puedes tener más teléfonos espejados a la vez.
- **VPS (opcional):** si además quieres panel remoto, ver `docs/PLAN-LOCAL-VPS.md` (escenario B: Express en VPS + túnel al Mini PC).

---

*Referencias: `docs/INTERCONEXION.md` (mapa de procesos), `docs/AUDIT.md` (seguridad), `MANUAL.md` (operación), `docs/PLAN-LOCAL-VPS.md` (local/VPS).*
