# MANUAL DE OPERACIÓN — Phone Farm Control Center

**Fecha:** 9 agosto 2026  
**Versión:** 2.5 (post-endurecimiento auth + reparación interconexión)

> 🔗 **Nuevo:** consulta [`docs/INTERCONEXION.md`](docs/INTERCONEXION.md) para el mapa completo de procesos, puertos y auth por capa.

---

## ÍNDICE

1. Cómo funciona (arquitectura real)
2. Flujo de generación de vídeos
3. Pipeline de engagement bots
4. Panel React + Stack
5. Calendario de programación
6. Configuración y entorno
7. Problemas conocidos y soluciones

---

## 1. ARQUITECTURA — CÓMO FUNCIONA

```
┌──────────────────────────────────────────────────────────────────┐
│  MINI PC (Windows)                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Flask       │  │  Express     │  │  MoneyPrinterTurbo    │ │
│  │  (port 5000) │  │  (port 3000) │  │  (port 8501)         │ │
│  │  phonefarm   │  │  server.ts   │  │  + native processes  │ │
│  └──────┬────────┘  └──────┬────────┘  └─────────────────────┘ │
│         │                    │                                  │
│         └────────┬───────────┘                                  │
│                  │                                              │
│           ┌──────┴─────┐                                        │
│           │   React    │                                        │
│           │  Panel:3000│  ← usuario opera aquí                 │
│           └────────────┘                                        │
│                  │                                              │
│    ┌───────────┴────────────┐                                  │
│    │      ADB Device        │                                  │
│    │ (teléfonos físicos)    │                                  │
│    └────────────────────────┘                                  │
└───────────────────────────────────────────────────────────────┘
```

### Procesos que deben estar corriendo:

| Proceso | Puerto | Qué hace |
|---------|--------|----------|
| `python -m phonefarm.platform` | 5000 | Backend API + datos + bots + MCP |
| MCP server (uvicorn, en el mismo PID) | 5001 | 15 tools para agentes IA |
| `npx tsx server.ts` | 3000 | Proxy + panel React + auth |
| MoneyPrinterTurbo (FastAPI) | 8080 | Generación de vídeo IA (loopback) |
| `adb` daemon | 5037 | Descubrimiento dispositivos |

---

## 2. FLUJO DE GENERACIÓN DE VÍDEOS (Pipeline 3 etapas)

Cada reel pasa por estas etapas:

```
KEYWORD → [1: SCRIPTING] → [2: AWAITING_APPROVAL] → 
[3: GENERATING] → [4: AWAITING_PREVIEW] → [5: PUBLISH] → 
[6: PUBLISHED / AWAITING_MANUAL_UPLOAD]
```

### Etapa 1: SCRIPTING
- **Trigger:** Usuario añade un job a la cola (`POST /api/queue/add`) o ejecuta el pipeline manualmente
- **Qué pasa:** MiniMax M2.7 genera el guion en base al nicho de la cuenta + keyword
- **Modelo:** `miniMax-chat` con contexto del nicho específico

### Etapa 2: AWAITING_APPROVAL (manual)
- **Trigger:** Automático al completar script (estado → `awaiting_approval`)
- **Qué pasa:** El sistema espera que alguien APPROVE el guión
- **Endpoint:** `POST /api/queue/:id/approve` → aquí se valida guion antes de proceder

### Etapa 3: GENERATING
- **Trigger:** Aprobación del guión → cambia estado a `generating` 
- **Qué pasa:** MoneyPrinterTurbo procesa el guión y descarga vídeo
- **Redirect:** Si no hay archivos de stock locales → `pexels.com` HD clips + edge-TTS para voz

### Etapa 4: AWAITING_PREVIEW
- **Trigger:** Vídeo descargado y unido (ffmpeg) → estado `awaiting_preview`
- **Qué pasa:** El vídeo ya está listo; desarrollar previsualización pulsando «Ver»
- **Video URL:** `GET /videos/:file` sirve el archivo real guardado en `storage/tasks/`

### Etapa 5: PUBLISH
- **Trigger:** Usuario clicka «Publish» en la preview → estado `publishing`
- **Qué pasa:** Instagrapi sube el reel + caption + hashtags a Instagram, usa el proxy asignado a la cuenta
- **Fallback:** Si da error (challenge Instagram), reintenta ADB mode: sube el MP4 al teléfono → Manual upload

### Etapa 6: Resultado final
- **published:** Todo OK, engagement iniciado
- **awaiting_manual_upload:** Story para revisión de usuario (no crítico)

---

## 3. PIPELINE ENGAGEMENT BOTS (taktik-bot)

Para cada cuenta:  

```
[FIXED RATE] → [DAILY TARGET] → [BATCH] → [DELAY]
```

- **Warmup day:** days_since_created → aumenta el plafón de acciones  
- **RATE limit:** hora del día → pausa según tabla (evita detectación)

**Casos de estado:**
- `bot_active=true` → corriendo
- `bot_active=false` → parado manualmente o error Instagrapi

---

## 4. PANEL REACT + STACK

**Stack de sesión:**
- Stack nativo: three procesos (`platform`, `moneyprinter`, `mcp` dentro de platform)
- Flask backend health: online/offline
- MoneyPrinterTurbo health: online/offline
- Drafts: vídeos terminados pero sin publicar

**Panel React (http://127.0.0.1:3000/):**
- **Sidebar:** Acceso rápido a todas las secciones
- **Header:** Estado de dispositivos (botón **Panda** → abre `/panda` en otra ventana), bots, proxies, CPU, reloj, tema
- **Tema:** toggle ☀/☾ (persistente en `localStorage` via `phonefarm-theme`)
- **Modales:** Se abren desde la sidebar (Dispositivos, Proxies, Calendario, Generador, ADB, cURL, Código, Versiones)

**Vista en vivo "Panda" (`/panda`):**
- Grid con **todas las pantallas de los teléfonos en tiempo real** (screencap por `adb`, refresh ~1.2s).
- Abrible con **1 click** desde el header (botón "Panda") o la sidebar → `window.open('/panda')`.
- **Manejo desde la propia pantalla:** clic = tap · arrastrar = swipe · botones ◀(atrás) ■(inicio) ▣(recientes).
- **Botón "Manejar (scrcpy)"** en cada tarjeta → abre la ventana nativa scrcpy (control total: tap, texto, scroll, rotación).
- Requiere sesión; el screenshot viaja por `GET /api/adb/screenshot/:serial` (PNG, cache 900 ms).
- ⚠️ Si un dispositivo no responde al control táctil web (p.ej. `input` bloqueado sin root), usa **scrcpy** para manejarlo.

**Notas importantes:**
- Después de 10 minutos sin interactuar en la UI, el siguiente fetch provoca reload de datos del backend  
- Cada 5s se actualizan stats (cuentas, cola, proxies, CPU) por polling; los logs llegan en vivo por SSE
- Todo es autenticado — sesiones multi-usuario en memoria con expiración (24h) y RBAC

### Autenticación (v2.4+)

- **Login:** `POST /api/auth/login` — crea una sesión por usuario (ya no hay sesión global única).
- **Multiusuario:** admin y operator pueden estar logueados a la vez; un login no pisa al otro.
- **Logout:** `POST /api/auth/logout` — exige sesión y solo revoca la sesión actual.
- **RBAC:** admin puede crear/borrar cuentas y proxies, borrar jobs, descargar ZIP y ver código fuente. Operator opera el pipeline (aprobar/publicar/programar/iniciar bots) pero no gestiona infraestructura.
- **Expiración:** 24h desde el login (cookie `Max-Age` + `expiresAt` en servidor). Reiniciar Express cierra todas las sesiones.

---

## 5. CALENDARIO DE PROGRAMACIÓN

**Cómo usar:**
- **Vista Mes:** cada píldora es una publicación programada  
- **Vista Semana/Día:** cada evento posicionado en la franja horaria 
- **Vista Agenda:** tabla cronológica completa  
- **Filtros:** global / por cuenta / por terminal  

**Interacción:**
- **Arrastra y suelta** píldoras entre días para reprogramar
- **Click en un slot** (día o hora) para crear un nuevo evento (abre formulario con fecha pre-rellenada)
- **Click en una píldora** para ver sus datos
- **Hoy/←/→** para navegar el calendario
- **Color de la píldora:** cada cuenta tiene un color fijo (`getEventColor` por `target_account`)

**Drag & Drop:**
- **Vista Mes:** drop target = día completo (se preserva la hora original)
- **Vista Semana/Día:** drop target = celda hora×día (overrides la hora exacta)
- **Durante drag:** la celda destino se resalta en azul (soltar aquí)
- **Endpoint subyacente:** `POST /api/queue/:id/schedule` con la nueva fecha

---

## 6. CONFIGURACIÓN Y ENTORNO

### platform/.env
```bash
FLASK_PORT=5000
PEXELS_API_KEY=<tu-clave-pexels>
MINIMAX_API_KEY=<tu-clave-minimax>
MINIMAX_BASE_URL=https://api.minimax.chat/v1
MINIMAX_MODEL=miniMax-chat
INTERNAL_TOKEN=<token-generado-por-setup>
```

### Git / scripts
- **Queue.json** integrado: no borrar, invisible a usuario, la cola de producción
- **accounts.json** identidades Instagram (cuenta + device + proxy + bot state)
- **proxies.json** IPs para usar (cada cuenta tiene su proxy)

### Puertas de entrada
- **Usuario≈Dev :** http://127.0.0.1:3000/
- **Automatización :** http://127.0.0.1:5000/ (headless, solo interfaz)
- **MCP (para compañero IA) :** http://localhost:5001/stream

---

## 7. PROBLEMAS CONOCIDOS Y SOLUCIONES

### Problema: Los jobs quedan stuck en `generating`
**Causa:** ffmpeg tarda mucho en Mini PC (8GB RAM) y MoneyPrinterTurbo marca como OK demasiado pronto  
**Solución rodante:** Aumentados timeouts en generator.py + retry en plataforma de descarga  
**Estado:** Mitigado, monitorea de cerca rentals de 8gb  

### Problema: Instagram Challenge — fallback a ADB push
**Causa:** IG bloquea la IP del proxy → la solicitud se responde con challenge  
**Comportamiento:** Intenta push ADB automático al teléfono asignado  
**Solución:** Verificar proxy, revisar la cuenta IG (cambio de IP a domicilio no debería pasar si el proxy está bien configurado)

### Problema: Video descargado pero no visible en PostPreview
**Causa:** Nombre de archivo guardado por MoneyPrinterTurbo es largo y complejo, el servidor no lo encontraba  
**Solución:** Cambiado el patrón de búsqueda en `/api/queue/:id/draft` para que acepte archivos del tipo ReelsFinal

### Problema: Calendar no permite reprogramar  
**Causa:** Old ScheduleModal no tenía drag & drop ni handler API  
**Estado:** RESUELTO — ahora es 100% interactivo HTML5

### Problema: Flask offline tras reiniciar
**Causa:** El proceso virtual de platform.py nunca arranca por su cuenta si ha habido un error en el MCP submodule  
**Solución:** `pip install mcp` o centrarse en el thread del panel (MCP opcional si no usas)

### Autenticación multiusuario
**Estado:** ✅ **RESUELTO (v2.5)** — sesiones multi-usuario en memoria con RBAC (ver §4).
**Nota:** las sesiones viven en memoria del proceso; reiniciar Express las cierra todas (los usuarios vuelven a loguear).
**Pendiente:** persistir sesiones en disco/Redis para sobrevivir reinicios.

### Botón minimize terminal
**Estado:** presente pero nunca implementado  
**Pendiente:** añadir handler de estado [terminalMin](/src/components/TerminalLogs.tsx) → prop `isMinimized` en App.tsx

---

## ESTADOS ACTUALES DEL PROYECTO

| Componente | Estado | Issues | Última vez tocado |
|-----------|--------|--------|-------------------|
| Panel React (diseño/tema) | ✅ V2 stable | — | 6 ago 2026 |
| Flask backend | ✅ Estable | 1 open concern (reconnect) | 6 ago 2026 |
| MoneyPrinterTurbo | ✅ Generación real | throughput con 8GB RAM | 5 ago 2026 |
| Calendario programación | ✅ Implementado | — | 8 ago 2026 |
| Tema claro/oscuro | ✅ Implementado | — | 8 ago 2026 |
| Auth multiusuario + RBAC | ✅ **Implementado (v2.5)** | sesiones en memoria (no sobreviven reinicio) | 9 ago 2026 |
| Persistencia JSON | ✅ Atómica (tmp+rename) | — | 9 ago 2026 |
| Version control modal | ⚠️ Falso (download real) | remove fake restore | — |

*El sistema está compitiendo bien — todos los jobs pending deberian despachar en serie en el scheduler cuando llega la hora programada.*

1. **Flask** → `python -m phonefarm.platform` (o `platform/scripts/run-native.ps1` para todo).
2. **Express** → `npx tsx server.ts` (o `bun run dev`).
3. **MPT** se arranca con `run-native.ps1`; en frío: `cd platform/third_party/MoneyPrinterTurbo && .\.venv-mpt\Scripts\python.exe main.py`.
4. Abre `http://127.0.0.1:3000` → login → header **Panda** para ver las pantallas en vivo.

---

## 8. MAPA DE INTERCONEXIÓN (resumen)

Para operar sin sorpresas, recuerda qué proceso habla con cuál:

```
Navegador ──(cookie pf_session)──▶ Express:3000 ──(X-Internal-Auth)──▶ Flask:5000
                                          │
                                          ├──▶ MCP :5001 (agentes IA, loopback)
                                          ├──▶ MPT :8080 (generación vídeo, loopback)
                                          └──▶ adb :5037 ──▶ teléfonos USB
```

- **NADA** se expone a la red directamente: Express :3000 escucha SOLO en 127.0.0.1
  (acceso remoto con Tailscale Serve HTTPS — [`docs/ACCESO-SEGURO.md`](docs/ACCESO-SEGURO.md)).
- **Dos `.env`:** el de la raíz (Express) y `platform/.env` (Flask). `PHONE_FARM_INTERNAL_TOKEN` (raíz) **debe ser igual** a `INTERNAL_TOKEN` (platform).
- **Persistencia (desde la remediación 2026-08-13):** SQLite `platform/data/phonefarm.db`
  (WAL) con campos cifrados AES-256-GCM; clave maestra DPAPI (`platform/data/master.key`).
  Los `*.json` en claro se migran con `python -m phonefarm.migrate --commit`.
- **Usuarios del panel:** `platform\scripts\create-admin.ps1` (scrypt en BD; el primer
  admin es obligatorio para arrancar).
- **Backups:** `platform\scripts\export-data.ps1` / `restore-backup.ps1` (.pfbackup
  cifrado con passphrase; nunca ZIP en claro).
- **Tokens MCP:** `python -m phonefarm.mcp_tokens create` (ver [`docs/MCP-INTEGRATION.md`](docs/MCP-INTEGRATION.md)).
- **Auditoría:** eventos encadenados con HMAC en `audit_log` (verificar con
  `python -c "from phonefarm.audit import verify_chain; from phonefarm.platform_data import _conn; print(verify_chain(_conn()))"`).
- **Detalle completo:** [`docs/INTERCONEXION.md`](docs/INTERCONEXION.md).
