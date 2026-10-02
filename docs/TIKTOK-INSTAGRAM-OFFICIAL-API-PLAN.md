# Plan hacia APIs oficiales — Instagram y TikTok

**Estado**: análisis (sin implementar). **Fecha**: 2026-10-02.

## Premisas

- `taktik-bot` (engagement automatizado) **NO se actualiza** (Fase 4): sus refinamientos son
  para que interacciones automáticas esquiven controles anti-spam. Optimizarlo es construir
  evasión de plataforma, no algo que vayamos a mantener.
- Toda interacción automática con cuentas de Instagram o TikTok **fuera de las APIs oficiales
  documentadas** queda fuera del alcance. El sistema debe poder publicar contenido legítimo
  sin orquestar follows/likes/comments artificiales.
- "Calentar cuentas" deja de ser un objetivo; se sustituye por una **rampa de publicación**
  dentro de los límites oficiales de cada API.

---

## 1. Inventario funcional con evidencia

| Pieza | Estado | Evidencia (archivo:línea) | Notas |
|---|---|---|---|
| **Listar cuentas** | Implementado | `platform.py:6` (`GET /api/accounts`), `app.ts:467` proxy | OK |
| **Crear cuenta (datos)** | Implementado | `platform.py:7` (`POST /api/accounts`), `app.ts:468` | Acepta `{username,password,device_serial,proxy_id}`. **Solo guarda metadata + sesión cifrada** — NO crea la cuenta en Instagram/TikTok. |
| **Cuenta desde dispositivo ADB** | Implementado | `platform.py:1276-1278`, `app.ts:654` (`/api/accounts/from-device`) | Crea metadata desde un device ya autorizado. Sigue sin tocar Instagram/TikTok. |
| **Login Instagram (one-shot)** | Implementado | `publisher.py:129` `login_once()` | Llama `Client().login(username, password)` de instagrapi. Crea `sessions/<account_id>.json`. **Este es el ÚNICO login permitido** (publisher.py:1-9 docstring). |
| **Publicar Reel** | Implementado | `publisher.py:210` `publish_video()` | Usa `instagrapi.Client.clip_upload(...)` con sesión persistente. |
| **Engagement (likes/follows/comments)** | Implementado | `engagement.py:1-3,49` docstring, `engagement.py:132` `start_bot()` | Spawns `python -m taktik automation workflow` por cuenta. Warmup progresivo 30→50→100 acciones/día. **Esto es lo que NO vamos a mantener.** |
| **Auto-warmup / ramp de publicaciones** | Solo documentado (no enforce) | `engagement.py:9` ("warmup progresivo"), `src/types.ts:14` ('warmup' status) | Hoy warmup_day se interpreta como "días que lleva activa la cuenta para escalar follows/likes". Re-conceptualizar como "días para escalar publicaciones". |
| **Publisher TikTok** | Inexistente | grep `tiktok` en `publisher.py` → 0 hits | Solo aparece en frontend (`src/App.tsx:582` `platform: 'instagram' \| 'tiktok' \| 'both'`), pero backend no tiene implementación. |
| **Verificación de login en runtime** | Implementado | `publisher.py:145-147` `client.login(username, password)` | Lanza ChallengeRequired etc.; el sistema NO resuelve challenges. La cuenta queda con `last_login_check` actualizado. |
| **Drafts de contenido (para revisión)** | Implementado | `content.py:1-13` docstring, `content.py:202` `_llm_call()` | Genera guiones con LLM (Kimi/OpenAI/MiniMax), espera aprobación humana, luego publica. |
| **Métricas en dashboard** | Implementado | `src/types.ts:18-22` (`warmup_day`, `likes_today`, etc.) | Algunas métricas son de engagement y dejarían de existir. |
| **Selección de plataforma al publicar** | Solo frontend | `src/App.tsx:582` | El backend acepta `platform` pero solo publica en Instagram. |

**Resumen del estado**: de las 12 piezas, **8 están implementadas**, **3 son mock/solo frontend** (publisher TikTok, ramp de warmup, selección real cross-platform), y **1 es lo que NO vamos a mantener** (engagement automation).

---

## 2. Instagram — Graph API (Content Publishing API)

### Vía oficial viable

**Meta Graph API v24.0+** con permiso `instagram_content_publish`. Solo funciona con cuentas
**Instagram Business** o **Instagram Creator** conectadas a una página de Facebook.

Documentación: https://developers.facebook.com/docs/instagram-api/guides/content-publishing

### Flujo OAuth requerido

1. **App de Facebook** registrada en developers.facebook.com con producto "Instagram".
2. **Login como Facebook Page** + **conectar Instagram Business Account** (one-time, manual).
3. OAuth flow: el operador autoriza la app → token de larga duración (60 días, renewable).
4. **Publicar Reel**: `POST /v24.0/{ig-user-id}/media` (con `media_type=REELS`,
   `video_url=...`, `caption=...`) → devuelve `creation_id`. Polling
   `GET /v24.0/{creation_id}?fields=status_code` hasta `FINISHED`. Opcionalmente
   `POST /v24.0/{ig-user-id}/media_publish` con `creation_id`.

### Límites oficiales

- 25 posts / 24h por cuenta Business.
- 5 reels / 7 días por cuenta recién creada (rampa documentada de Meta).
- Videos: max 90s, 9:16, max 100MB, mp4.
- **NO hay API para follows/likes/comments** — Meta nunca la ofreció a terceros.

### Qué partes actuales quedarían obsoletas

- `publisher.py` (instagrapi): reemplazado por cliente HTTP a Graph API.
- `engagement.py` (taktik-bot para Instagram): eliminado. La API no lo soporta.
- `proxy_manager.py` para rotación de IP en login: ya no hace falta porque Graph API no
  usa IPs del cliente; el login es OAuth contra facebook.com, no contra instagram.com.
- `warmup_day` en cuentas: reinterpretado como "días desde la conexión OAuth".

### Cambio necesario (resumen)

- Nuevo módulo `platform/instagram_graph.py`: cliente Graph API + gestión de tokens.
- OAuth callback handler en Flask (`/auth/instagram/callback`).
- UI nueva en frontend: "Conectar Instagram Business" (botón que dispara OAuth).
- Migrar `publish_video()` a Graph API.
- Eliminar `publisher.py:instagrapi` y el login por username/password.

---

## 3. TikTok — Content Posting API

### Vía oficial viable

**TikTok for Developers — Content Posting API**. Requiere app aprobada por TikTok
(proceso de review, no automático), categoría "Content Posting" o "Display API".

Documentación: https://developers.tiktok.com/doc/content-posting-api-overview

### Flujo OAuth requerido

1. **App en TikTok for Developers** con scopes: `user.info.basic`, `video.upload`,
   `video.publish`.
2. OAuth 2.0: el operador autoriza → access_token (24h) + refresh_token (365 días).
3. **Inicializar upload**: `POST /v2/post/publish/video/init/` con
   `source_info=FILE_URL` (or `PULL_FROM_URL`) → devuelve `upload_url` + `publish_id`.
4. Subir bytes al `upload_url` (PUT binario).
5. Polling `POST /v2/post/publish/status/fetch/` con `publish_id` hasta
   `PUBLISH_COMPLETE`.

### Límites oficiales

- 30 videos / 24h por cuenta, hasta 60 / día por app.
- Video: max 10 min (ahora 60s para cuentas recién creadas, ramp implícita).
- Sin API de follows/likes/comments — TikTok nunca la ofreció a terceros para uso general.

### Qué partes actuales quedarían obsoletas

- `engagement.py` (taktik-bot para TikTok): eliminado.
- Frontend: el selector `platform: 'instagram' \| 'tiktok' \| 'both'` deja de ser "ambos
  simultáneos" — ahora son cuentas separadas, cada una con su OAuth.

### Cambio necesario (resumen)

- Nuevo módulo `platform/tiktok_api.py`: cliente TikTok for Developers.
- OAuth callback handler en Flask.
- UI nueva: "Conectar TikTok Creator".
- Migrar/añadir `publish_tiktok()`.
- Eliminar dependencia de `tiktok-bot` para engagement.

---

## 4. Creación de cuentas — flujo manual asistido

**No existe API oficial para crear cuentas de Instagram ni TikTok.** El registro es humano:
email/phone + CAPTCHA + a veces verificación de identidad (KYC para Business).

### Flujo propuesto

1. **Operador humano** crea la cuenta en instagram.com o tiktok.com (con su email,
   su teléfono, su KYC si hace falta para Business).
2. Si es Instagram: convertir a Business en instagram.com (Settings → Account type and tools).
   Conectar a una Facebook Page (en Meta Business Suite).
4. En el panel: **"Conectar cuenta existente"** → dispara OAuth contra Meta/TikTok.
5. El panel guarda `access_token` (cifrado en `accounts.json`), `ig-user-id` / `open_id`,
   fecha de conexión.
6. A partir de ahí, todo es publicación automática. **Nunca** login automático con
   username/password.

### Cambio necesario

- Eliminar el campo `password` en `accounts.json` (hoy se guarda cifrado en
  `phonefarm.crypto`); no se necesita para OAuth.
- Eliminar `POST /api/accounts` con `{username, password, ...}` y reemplazarlo por
  `POST /api/oauth/instagram/callback` + `POST /api/oauth/tiktok/callback`.
- UI: cambiar "Add account" a "Connect existing account".

---

## 5. Calentar cuentas → rampa de publicación

### Concepto actual (no mantener)

`warmup_day` controla la frecuencia de follows/likes artificiales (engagement.py:49-66).
Esto NO debe existir cuando nos movamos a APIs oficiales.

### Concepto nuevo: rampa de publicaciones

Una rampa de publicaciones dentro de los límites documentados de cada API. Para Instagram:

| Días desde conexión | Reels / día | Cooldown entre posts |
|---|---|---|
| 0-3 | 1 | 24h |
| 4-7 | 2 | 12h |
| 8-14 | 3 | 8h |
| 15+ | hasta 25 (límite oficial) | 1h |

Para TikTok: rampa similar respetando el límite de 30/24h.

### Cambio necesario

- Reemplazar `warmup_day` por `connection_day` (más honesto: no es "warmup" sino
  "días desde que el operador conectó la cuenta").
- `content.py:queue` aplica la rampa al programar publicaciones.
- Eliminar cualquier UI que muestre `likes_today` / `follows_today` / `comments_today`
  (no existen vía API oficial).

---

## 6. Matriz Función | Estado actual | Vía oficial viable | Cambio necesario | Esfuerzo

| Función | Estado actual | Vía oficial viable | Cambio necesario | Esfuerzo |
|---|---|---|---|---|
| Crear cuenta Instagram | Placeholder (guarda username/password) | Manual + OAuth (Graph API) | Nuevo módulo `instagram_graph.py`, OAuth callback, UI "Connect Instagram", eliminar password storage | M (1-2 semanas) |
| Login Instagram | `instagrapi.Client.login()` (one-shot, sessions/*.json) | OAuth contra Meta + tokens persistentes | Eliminar `publisher.py:login_once`, sustituir por OAuth refresh-token | M |
| Publicar Reel Instagram | `instagrapi.Client.clip_upload()` | Graph API `media` + `media_publish` | Reescribir `publish_video()` para Graph API | S-M (1 semana) |
| Crear cuenta TikTok | Inexistente en backend | Manual + OAuth (TikTok for Developers) | Nuevo módulo `tiktok_api.py`, OAuth callback, UI "Connect TikTok" | M (requiere app aprobada por TikTok — variable) |
| Publicar video TikTok | Inexistente en backend | TikTok Content Posting API | Nuevo `publish_tiktok()` | M |
| Engagement (likes/follows/comments) | taktik-bot subprocess (Fase 4: NO se actualiza) | **No existe** | **Eliminar `engagement.py`, `third_party/taktik-bot`, lockfile entry** | S |
| Warmup progresivo | engagement.py:49-66 (engagement scale) | Sustituido por rampa de publicaciones | Reemplazar `warmup_day` por `connection_day`, ajustar `content.py` y UI | S |
| Métricas del dashboard | `src/types.ts:20-22` (likes_today, follows_today) | Métricas oficiales vía APIs: `media_insights` (IG), `video/insights` (TikTok) | Añadir `insights` module, eliminar métricas de engagement | M |
| Selección cross-platform al publicar | Solo frontend (`App.tsx:582`) | Cada cuenta tiene su propia conexión OAuth | Reescribir `publish` para dispatch por `account.platform` | S |

**Esfuerzo total**: 3-6 semanas para los 9 ítems, asumiendo:
- App de Facebook Developers ya registrada (5 min).
- App de TikTok for Developers ya aprobada (variable, días a semanas; plan B: empezar solo con Instagram).
- Frontend SSH con React/Vite (ya existe).

---

## 7. Plan de implementación por fases

### Fase A — eliminar engagement automation (S, 2-3 días)

- Eliminar `platform/phonefarm/engagement.py`.
- Eliminar `platform/third_party/taktik-bot/` (gitignored, no impacta repo).
- Eliminar entry de taktik-bot en `third_party.lock`.
- Eliminar `taktik-bot` de `requirements.txt`.
- Eliminar deps: `uiautomator2`, `adbutils`, `pure-python-adb`, `pywin32` (si deja de
  usarse en otro sitio; verificar grep).
- Eliminar UI: `src/components/VersionControlModal.tsx:46`, `src/App.tsx:80` "bots taktik",
  `src/components/LoginScreen.tsx:74`, `src/components/Header.tsx:128`.
- Eliminar engagement references en `src/types.ts`.
- Eliminar scope `engagement` de `mcp_server.py:47-48`.

**Criterio de aceptación**: `grep -ri "taktik\|engagement" src platform` → solo aparece en
docs y comentarios históricos; ningún endpoint activo responde a bots.

### Fase B — sustituir instagrapi por Graph API (M, 1-2 semanas)

- Crear `platform/phonefarm/instagram_graph.py` con `InstagramGraphClient` (HTTP a
  `graph.facebook.com/v24.0`).
- Crear `platform/phonefarm/oauth_meta.py` con flujo OAuth + callback en Flask
  (`/auth/meta/callback`).
- Nueva tabla/ruta: `POST /api/accounts/connect/instagram` (admin only) que devuelve la
  URL de OAuth; `GET /api/accounts/oauth/callback` que intercambia code por token y
  guarda `ig-user-id` + access_token cifrado.
- Reescribir `publisher.py`:
  - Eliminar `instagrapi` import.
  - `publish_video()` → `client.publish_reel(video_url, caption)`.
  - Eliminar `login_once()` (ya no hay login por password).
- Añadir `platform/requirements.txt`: `requests` (ya), `cryptography` (ya).
- Eliminar `instagrapi==2.18.12` de requirements.txt.
- UI: reemplazar "Add account" por "Connect Instagram Business" (botón que dispara OAuth).

**Criterio de aceptación**:
- Conectar una cuenta Instagram Business real vía OAuth → token guardado, panel muestra cuenta.
- Subir un Reel de prueba → aparece en instagram.com del operador.
- `grep -ri "instagrapi" platform` → 0 hits.
- Suite pytest pasa con sin instagrapi instalado (mockear Graph API en tests).

### Fase C — añadir TikTok Content Posting API (M, 1-2 semanas)

- Crear `platform/phonefarm/tiktok_api.py` con `TikTokClient`.
- Crear `platform/phonefarm/oauth_tiktok.py`.
- Rutas nuevas: `POST /api/accounts/connect/tiktok`, `GET /api/accounts/oauth/callback/tiktok`.
- Reescribir `publisher.py` para dispatch por `account.platform`.
- Añadir publicación cross-platform cuando hay múltiples cuentas conectadas.

**Criterio de aceptación**: igual que Fase B pero para TikTok. El bloqueante externo es la
revisión de TikTok for Developers.

### Fase D — rampa de publicaciones (S, 3-5 días)

- Renombrar `warmup_day` → `connection_day` en DB, frontend, lógica.
- `content.py:_schedule_next_post()` consulta la rampa de la cuenta.
- Eliminar UI de engagement: `src/types.ts:20-22` → vacío, `Header.tsx:128` "bots taktik" fuera.

**Criterio de aceptación**: cuenta recién conectada no publica más de N/día según rampa;
cuenta de 30 días respeta límite oficial.

### Fase E — métricas oficiales (M, 1 semana)

- `platform/phonefarm/insights.py`: cliente de `media_insights` (IG) y `video/insights` (TikTok).
- `GET /api/accounts/:id/insights` devuelve views, likes (oficial), reach, saves, shares.
- Dashboard React: pestaña "Insights" por cuenta.

**Criterio de aceptación**: tras publicar un Reel, abrir Insights en el panel y ver
los números reales que devuelve la API oficial.

---

## 8. Decisiones que me faltan a mí (operador)

1. **¿Se elimina engagement automation completamente, o se conserva como feature opt-in
   por cuenta, con consentimiento explícito en la UI y disclaimers sobre TOS de las
   plataformas?** Mi recomendación: eliminarlo.
2. **¿Se intenta aprobación de TikTok for Developers antes de Fase C, o se arranca
   solo con Instagram (Fase B) y se añade TikTok cuando llegue la aprobación?**
   Mi recomendación: arrancar solo con Instagram.
3. **¿La app de Facebook Developers se registra a nombre del operador o de Phone Farm
   Platform?** Implica términos de servicio de Meta.
4. **¿Se mantiene `instagrapi` como fallback para cuentas personales que no son Business,
   o se rompe la compatibilidad y se fuerza migración a Business?** Mi recomendación:
   romper — Meta ya no permite Content Publishing en cuentas personales de todos modos.