# 📱 Phone Farm Platform — Manual de Uso Completo

**Versión:** 2.4 REAL (migración Docker → Nativo)
**Última actualización:** 2026-08-05
**Entorno:** Mini PC Windows 8 GB RAM, 2 teléfonos Android vía USB

---

## 1. Arquitectura del sistema

```
Mini PC (Windows)
├── Flask API          :5000  (platform\.venv\Scripts\python.exe -m phonefarm.platform)
├── MCP server         :5001  (mismo proceso Flask, /mcp)
├── MoneyPrinterTurbo  :8080  (third_party\MoneyPrinterTurbo\.venv-mpt\python main.py)
├── Panel React        :3000  (npx tsx server.ts — Express proxy a Flask)
├── ADB (platform-tools)      — dispositivos físicos vía USB
└── Teléfonos:                ZY326WFTMQ (Motorola One Action) · 489f214 (Redmi S2)
```

**Flujo de datos:**
`Panel React (:3000) → API Flask (:5000) → MPT (:8080) genera vídeo → ffprobe valida → publisher.py publica en Instagram (con sesión) → fallback ADB push si IG bloquea`

---

## 2. Arranque del sistema

### Arrancar todo (Flask + MCP + MPT + Panel)
```powershell
# Terminal 1 — backend (Flask :5000 + MCP :5001 + MPT :8080)
powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1

# Terminal 2 — panel React (:3000)
cd "C:\Users\haxth3\Documents\phone-farm-platform (1)"
npx tsx server.ts
```

### Parar todo
```powershell
powershell -ExecutionPolicy Bypass -File platform\scripts\run-native.ps1 -Stop
# y Ctrl+C en el panel
```

### Verificar que todo está arriba
```bash
curl http://127.0.0.1:5000/api/stats      # → 200 JSON
curl http://127.0.0.1:8080/openapi.json   # → 200 MPT
curl http://127.0.0.1:3000/               # → 200 panel
adb devices -l                            # → lista los teléfonos
```

---

## 3. Panel de control (http://127.0.0.1:3000)

### Login
- **admin** / `admin123` (admin) · **operator** / `operator123` (operador)
- En producción (`NODE_ENV=production`) las contraseñas se definen en variables de entorno.

### Pestañas / Modales
| Botón | Función |
|---|---|
| **Dashboard** | Vista principal: cuentas, cola, logs |
| **MoneyPrinter** | Generar reels, config real del motor (LLM minimax, MPT :8080) |
| **ADB Bridge** | Test de conexión ADB + dispositivos detectados |
| **cURL API** | Probar cada endpoint REST de la API real |
| **Python Code** | Ver el **código real** del backend (sirve /api/source) |
| **Versiones** | Historial / respaldo ZIP |

### Sección CUENTAS & ADB DISPOSITIVOS
- **Nueva Cuenta**: registra una cuenta. Requiere:
  - username (Instagram), password, **device_serial REAL** (ver `adb devices`), proxy
  - El serial NO puede ser placeholder (`RFCW80XXXXX` se rechaza)
- **Datos**: detalles de la cuenta (solo datos reales: likes/follows/comments de hoy, jobs publicados)
- **Eliminar cuenta**: borra la cuenta (y detiene el bot si corre)
- **Iniciar/Detener Bot**: lanza/para taktik-bot en el dispositivo ADB de la cuenta

> 💡 **Atajo**: los 2 teléfonos conectados aparecen en el backend vía:
> `GET http://127.0.0.1:5000/api/adb/devices`
> y puedes crear cuenta directa desde dispositivo:
> `POST /api/accounts/from-device {"serial":"489f214","username":"x","password":"y"}`

### Sección COLA DE PRODUCCIÓN
- Escribe una **keyword** (ej: "decoracion sala moderna") + cuenta destino → **Keyword** para encolar
- **Generar & Publicar Siguiente**: procesa el primer job pendiente:
  1. `scripting` — MiniMax genera guión + caption + hashtags
  2. `awaiting_approval` — guión listo para revisión (Drafts++)
  3. **Aprobar** → `generating` — MPT genera el vídeo 9:16 (Pexels + EdgeTTS + subtítulos)
  4. `publishing` — publisher.py sube a Instagram
  5. `published` con `media_id` — listo
- **Rechazar**: descarta el guión
- **Ver** (preview): previsualiza el reel antes de publicar
- **Eliminar**: quita el job de la cola

### Consola de logs (SSE)
Stream en vivo de `logs/platform.log` — eventos reales del backend.

---

## 4. Configuración (platform/.env)

Variables clave (¡sin datos fake!):

```dotenv
# LLM (el único proveedor válido — el panel lo muestra, no lo edita)
LLM_PROVIDER=minimax
MINIMAX_API_KEY=sk-...
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M2.7

# Material de vídeo
PEXELS_API_KEY=...

# MoneyPrinterTurbo
MPT_API_URL=http://127.0.0.1:8080
MPT_VIDEO_ASPECT=9:16
MPT_VOICE_NAME=es-ES-AlvaroNeural

# Proxy DataImpulse (para verificación online real)
DATAIMPULSE_USER=
DATAIMPULSE_PASS=
```

> ⚠️ El panel muestra el LLM **real** leído de `.env` — no hay selector de LLMs falsos. Si quieres cambiar de proveedor, edita `.env` y reinicia.

---

## 5. Publicación real en Instagram

El pipeline genera el vídeo siempre; la **publicación** requiere una sesión de Instagram:

```bash
# 1. Login IG por cuenta (una sola vez — la sesión persiste cifrada en SQLite)
#    El username se toma de la cuenta ya registrada; solo el password va en el body.
curl -X POST http://127.0.0.1:5000/api/accounts/acc_01/instagram/login \
  -H "Content-Type: application/json" \
  -d '{"password":"TU_PASS_REAL"}'
#    → {"ok":true,"account_id":"acc_01"}     (sesión cifrada AES-256-GCM en social_sessions)
#    → {"ok":false,"error":"..."}  si credenciales inválidas o Challenge

# 2. Verificar que la sesión existe
curl http://127.0.0.1:5000/api/accounts/acc_01
#    → busca en la tabla social_sessions (SQLite), NO en un fichero sessions/*.json

# 3. Lanzar un job (o usar el panel)
curl -X POST http://127.0.0.1:5000/api/queue \
  -H "Content-Type: application/json" \
  -d '{"keyword":"organizar cocina pequena","target_account":"acc_01","auto_approve":true}'

# 4. El pipeline: guión MiniMax → MPT → ffprobe valida → instagrapi sube → published
```

**Si se omite el login**: `publish_video` llama `_has_session()` → no encuentra fila en `social_sessions` → registra el vídeo en `logs/fallback_queue.json` con estado `awaiting_manual_upload` y hace `adb push` al teléfono para subida manual desde el Dashboard.

**Fallback ADB**: si Instagram lanza ChallengeRequired/PleaseWaitFewMinutes (desafío real de IG, no credenciales), el comportamiento es idéntico: vídeo al teléfono + `awaiting_manual_upload`.

---

## 6. Endpoints API principales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/accounts` | Lista cuentas (sin passwords) |
| POST | `/api/accounts` | Crea cuenta |
| DELETE | `/api/accounts/<id>` | Elimina cuenta |
| POST | `/api/accounts/<id>/instagram/login` | Crea sesión IG (login_once) |
| POST | `/api/accounts/from-device` | Crea cuenta desde dispositivo ADB autorizado |
| GET | `/api/proxies` | Lista proxies + IP pública real |
| POST | `/api/proxies` | Añade proxy |
| POST | `/api/proxies/credentials` | Guarda user/pass y re-verifica |
| POST | `/api/proxies/verify` | Verifica proxy en vivo |
| GET | `/api/queue` | Cola de jobs |
| POST | `/api/queue` | Encola job |
| POST | `/api/queue/next` | Procesa siguiente (scripting) |
| POST | `/api/queue/<id>/approve` | Aprueba guión → generación+publicación |
| POST | `/api/queue/<id>/reject` | Rechaza guión |
| DELETE | `/api/queue/<id>` | Elimina job |
| GET | `/api/drafts` | Guiones en revisión |
| GET | `/api/stats` | Métricas reales (CPU/RAM del host) |
| POST | `/api/content/preview` | Guión+caption sin encolar |
| GET | `/api/content/profiles` | Perfiles de nicho |
| GET | `/api/adb/devices` | **Dispositivos reales conectados** |
| POST | `/api/adb/test-connection` | Test ADB + salud Flask |
| GET | `/api/source` | Archivos del backend (CodeViewer) |
| GET | `/api/source/<file>` | Contenido real de un archivo |
| GET | `/stream/logs` | SSE de logs en vivo |
| GET | `/videos/<file>` | Sirve MP4 generados |

---

## 7. Dispositivos ADB

```bash
adb devices -l
# ZY326WFTMQ  device  motorola_one_action
# 489f214     device  Redmi_S2
```

- **status=device** → autorizado y operativo
- **status=unauthorized** → el teléfono pide autorización: en el teléfono pulsa "Permitir siempre desde este equipo" en el diálogo de depuración USB
- Cada cuenta del panel se asocia a un serial real (1:1)

---

## 8. Solución de problemas

| Síntoma | Causa / Fix |
|---|---|
| "Servidor no disponible" | Flask caído: `run-native.ps1` y esperar READY. Verificar `curl :5000/api/stats` |
| Panel no responde :3000 | `npx tsx server.ts` desde la raíz del proyecto |
| Proxy offline | Credenciales DataImpulse vacías en `.env` o `POST /api/proxies/credentials` con las reales |
| `No existe sesión para acc_01` | Falta `login_once` — ver sección 5 |
| Serial placeholder rechazado | Usar el serial real de `adb devices` |
| MPT lento/generando | Normal en Mini PCs: 15-40 min por vídeo (poll cada 5s, timeout 1h) |
| ffmpeg crash (0xC0000005) | El shim de WinGet — usar el binario Gyan real (ya configurado en mpt-config.toml) |

---

## 9. Seguridad

- MPT solo escucha en `127.0.0.1` (CVE-2025-7897 mitigado)
- CORS solo loopback (127.0.0.1/localhost)
- Passwords nunca expuestas por API
- Sesión IG persistente: login único manual, nunca relogueo automático
- Credenciales de proxy enmascaradas en logs

---

## 10. Rollback Docker (si algún día se requiere)

```bash
cd platform
docker compose up -d --build
```
Los Dockerfile/docker-compose se mantienen intactos como vía de retorno.
