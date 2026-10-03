# MoneyPrinterTurbo Upstream Inspection — v1.3.7 vs v1.3.8

**Fecha:** 2026-10-03 10:35
**Investigador:** agente de rediseño UI
**TASK ref:** §13 — MPT integración, capacidad real

---

## 1. Estado del upstream

| | Pin local actual (este repo) | Upstream en `main` (GitHub) | Observación |
|---|---|---|---|
| SHA | `cf5a3aedad1741d012152d355aa909d224fc4557` | `fafec0fbf3142ad5ad7212c2e17996bf247c360a` | Upstream **avanzó** después de nuestro pin. |
| Versión (`pyproject.toml`) | 1.3.7 | 1.3.8 (bump hecho el 2026-10-03) | +1 release. |
| License | MIT | MIT | Sin cambio. |
| Release notes | (no consultadas en este repo) | Ver §2 | — |

> **El pin actual (`cf5a3ae…`) queda válido.** El adapter sigue apuntando a v1.3.7 y eso es estable. La sección §4 de este documento registra qué hay **arriba** (v1.3.8) para una futura migración bump-controlled.

---

## 2. Capacidades nuevas detectadas en v1.3.8 (no en nuestro pin)

### 2.1 Modos de uso

| Modo | Pin v1.3.7 | Upstream v1.3.8 | Notas |
|---|---|---|---|
| AI Agent (Skill document) | existe | **expandido** (sigue existiendo) | El Skill apunta a `docs/skill/SKILL.md`. |
| WebUI (Streamlit :8501) | sí | sí | — |
| API (FastAPI :8080) | sí | sí | — |
| **CLI batch** | parcial | **nuevo `cli.py --batch-file ./tasks.json --stop-at video`** | Batch JSON de hasta 100 tareas, 1 MiB, summary `total/succeeded/failed/tasks` por entry. |
| **Video projects (revision-aware)** | no | **NUEVO** (`docs/video-projects.md`) | Proyectos locales editables, opt-in, no provider calls automáticos. |

### 2.2 LLM providers (script generation)

**v1.3.7:** `MiniMax / OpenAI / Kimi` (referencias en config).
**v1.3.8:** + `Anthropic Claude`, `Google Gemini`, `DeepSeek`, `Alibaba Cloud Qwen`, `Microsoft Azure OpenAI`, `ByteDance VolcEngine Ark`, `xAI Grok`, `Xiaomi MiMo`. Más gateways: `Shengsuan Cloud`, `APIMart`, `Cloudflare AI Gateway`, `Alibaba ModelScope`, `AIHubMix`, `AIML API`, `EvoLink`, `OpenRouter`, `API Route`, `Fluxion AI`, `OfoxAI`, `Ollama`, `Claude Code subscription`, `OneAPI`, `LiteLLM`, `Groq`, `Pollinations AI`.

### 2.3 Materiales (vídeo/imagen fuente)

**v1.3.7:** local + Pexels + Pixabay + Coverr (lo que el adapter documenta).
**v1.3.8:** + `Metaso MiniMax H3` (768P/2K, 4–15s, 9:16/16:9/1:1), `Shengsuan Cloud AI Video`, `Volcano Engine Ark Seedance`, `WaveSpeed AI`, `OFox (Seedance, Wan, MiniMax H3)`, `MuAPI` (text-to-video async 3-12s), `OpenAI-compatible text-to-image`.

### 2.4 TTS providers (voz)

**v1.3.7:** `edge_tts`, `openai_tts`, `elevenlabs` (en el schema de `MoneyPrinterConfig` del panel).
**v1.3.8:** + `Azure TTS V2`, `SiliconFlow`, `Google Gemini TTS`, `Xiaomi MiMo TTS`, `MiniMax TTS`, `Chatterbox TTS` (self-hosted), `Kokoro TTS` (self-hosted), `Fish Audio TTS`, `ModelBest VoxCPM TTS` (con voice cloning desde reference audio, SSE streaming, MP3 conversion automática).

### 2.5 Subtítulos

| Capability | v1.3.7 | v1.3.8 |
|---|---|---|
| Provider edge | sí | sí |
| Provider whisper (faster-whisper) | sí | sí (modelos `large-v3` y `large-v3-turbo`) |
| **Subtitle display mode** | implícito | **NUEVO** `sentence` vs `word_by_word` |
| **Subtitle animation** | no | **NUEVO** `none` vs `pop_spring` |
| **Position presets** | bottom | **NUEVO** `top`, `bottom`, `center`, `custom`, `two_thirds_bottom` |
| **Custom position 0–100** | no | **NUEVO** |
| **Text background color** (bool/string) | no | **NUEVO** |
| **Rounded subtitle background** | no | **NUEVO** |
| `voice_rate` (speech rate) | no | **NUEVO** |

### 2.6 Background music

- `bgm_type` (random/local) — igual.
- `bgm_file` — igual.
- **`video_music_prompt: str 0-2000`** — NUEVO. Prompt compartido para music provider.
- `sonilo_bgm_prompt` — compatibilidad legada.

### 2.7 Video — nuevos campos (VideoParams v1.3.8)

| Campo | Tipo / rango | Notas |
|---|---|---|
| `video_fit_mode` | `cover` \| `contain` | Cómo llenar canvas con clip de aspect ratio diferente. |
| `video_transition_mode` | `None` \| `Shuffle` \| `FadeIn/Out` \| `SlideIn/Out` \| `ZoomIn/Out` | NUEVO. |
| `match_materials_to_script` | bool | Emparejar materiales con script. |
| `video_count` | 1–5 (API) | Acotado en API. CLI sin techo (lo decide VideoParams). |
| `video_clip_duration` | 1–15 (API) | — |
| `paragraph_number` | 1–10 | Párrafos para el script. |
| `voice_rate` | float | Speech rate TTS. |
| `bgm_volume`, `voice_volume`, `bgm_file` | iguales | — |
| `n_threads` | 1–16 (API) | Threads FFmpeg. |
| `video_script_prompt` | str 0-2000 | Prompt opcional para generación de script. |
| `custom_system_prompt` | str 0-8000 | System prompt custom LLM. |

### 2.8 Formatos de salida

- `16:9` (1920×1080), `9:16` (1080×1920), `1:1` (1080×1080). Sin cambios.

### 2.9 Cross-post / Publishing

- v1.3.8 introduce **campos explícitos** en `TaskStatusData`:
  - `cross_post_state: "pending" | "processing" | "complete" | "failed"`
  - `cross_post_results: List[dict]`
  - `cross_post_error: Optional[str]`
- Upload-Post sigue siendo el motor (TikTok / Instagram / YouTube Shorts).
- **Política Control Hub** ya establecida: feature flag `ENABLE_MPT_PUBLISHING` OFF por defecto, idempotency key, etc. (ver `MONEYPRINTERTURBO_ADAPTER.md` §6).

### 2.10 Nuevos endpoints (TaskListResponse + VideoSocialMetadata)

| Endpoint nuevo | Propósito | Decisión Control Hub |
|---|---|---|
| `GET /api/v1/tasks?page=X&page_size=Y` | Paginación | **LATER** — añadir cuando el panel implemente pagination en su tabla de queue. |
| `POST /api/v1/social-metadata` | Generar title/caption/hashtags | **NOW (partial)** — el panel ya tiene `DraftPost.caption/hashtags`, pero la generación viene del LLM upstream. Documentar en adapter. |
| `POST /api/v1/terms` | Extraer keywords del script | ya existía. |
| `POST /api/v1/scripts` | Generar script | ya existía. |

### 2.11 Observabilidad

- `progress: int 0-100` ya estaba. Sin cambios.
- `failed_stage: Optional[str]` (audio / video / subtitle / etc.) — NUEVO documentado. Permite al adapter y al panel saber **dónde** falló.

---

## 3. Decisiones para Control Hub

Cada capacidad upstream evaluada con el criterio del TASK §13.3 ("Mapping de capacidades").

| Capacidad upstream | Utilidad | Cómo integrar | Dominio afectado | Riesgo | Coste | Decisión |
|---|---|---|---|---|---|---|
| **AI Agent Skill MPT** | Bajo para CH (ya tenemos Flask). | Ninguna. | — | Ninguno. | — | **REJECT** — ya tenemos nuestro orquestador. |
| **CLI batch (`cli.py --batch-file`)** | Útil para CH si queremos disparar N tareas desde fuera. | Exponer `POST /api/moneyprinter/batch` proxy a `cli.py`. | `ContentProvider` + nueva ruta Flask. | Bajo (CLI no expone secretos). | Bajo. | **LATER** — planificar tras Gate E. |
| **Video projects (revision-aware)** | NO para V1 — añade complejidad sin ganancia inmediata. | Ninguno. | — | — | — | **LATER** — monitor en roadmap. |
| **+ LLM providers (Claude, Gemini, DeepSeek, Qwen, Azure OpenAI, VolcEngine, Grok, MiMo)** | ALTO — más opciones para el operador. | Añadir a `MoneyPrinterConfig.llm_provider` enum y al `mptSettingsSchema` Zod del panel. | `MoneyPrinter / Content`. | Bajo (cada provider tiene su billing). | Medio (API keys adicionales). | **LATER** — requiere actualizar schema + tests + UI. |
| **+ Material sources (MiniMax H3, Shengsuan, Seedance, WaveSpeed, OFox, MuAPI, OpenAI-compatible image)** | ALTO — abre AI footage. | Añadir `video_source` enum + UI step "Material source". | `MoneyPrinter / Content`. | Medio (costes GPU-cloud). | Alto (cada provider tiene coste). | **LATER** — necesita Capability Gate separado (TASK §13.3). |
| **+ TTS providers (Azure V2, SiliconFlow, Gemini, MiMo, MiniMax, Chatterbox, Kokoro, Fish, VoxCPM)** | ALTO — más voces. | Añadir a `audio_tts_engine` enum + UI step "Voz/TTS". | `MoneyPrinter / Content`. | Bajo (Edge sigue siendo default gratis). | Bajo/medio. | **LATER**. |
| **Subtitle `display_mode` / `animation` / `position` / `custom_position`** | MEDIO — UX. | Añadir campos al schema `mptSettingsSchema` + UI section. | `MoneyPrinter`. | Ninguno. | Ninguno. | **LATER**. |
| **`video_fit_mode` / `video_transition_mode`** | MEDIO — control fino. | Añadir a schema + UI "Avanzados". | `MoneyPrinter`. | Ninguno. | Ninguno. | **LATER**. |
| **`voice_rate`** | BAJO — control fino TTS. | Añadir a schema + UI. | `MoneyPrinter`. | Ninguno. | Ninguno. | **LATER**. |
| **`match_materials_to_script`** | MEDIO — calidad material↑. | Añadir a schema + UI toggle. | `MoneyPrinter`. | Ninguno. | Ninguno. | **LATER**. |
| **`paragraph_number`** | BAJO — control longitud script. | Añadir a schema + UI. | `MoneyPrinter`. | Ninguno. | Ninguno. | **LATER**. |
| **`video_script_prompt` / `custom_system_prompt`** | ALTO — control creativo. | Añadir a schema + UI "Prompt extra". | `MoneyPrinter`. | XSS (es prompt libre); sanitizar. | Ninguno. | **LATER**. |
| **`cross_post_state` / `cross_post_results` / `cross_post_error`** | ALTO — observabilidad. | Reflejar en `QueueJob.status` y detail drawer. | `Cola / Publicación`. | Ninguno. | Ninguno. | **NOW** — wiring del adapter para parsear estos campos en la reconciliación. |
| **`failed_stage`** | ALTO — diagnóstica. | Reflejar en `QueueJob.error` con prefijo `stage=<stage>`. | `Cola`. | Ninguno. | Ninguno. | **NOW**. |
| **`combined_videos`** | MEDIO — batch output. | Reflejar en `DraftPost.video_url`. | `Cola`. | Ninguno. | Ninguno. | **LATER**. |
| **`POST /api/v1/social-metadata`** | MEDIO — caption/hashtags automáticos. | Añadir `POST /api/moneyprinter/social-metadata` proxy. | `MoneyPrinter / Draft`. | Bajo. | Bajo. | **LATER**. |
| **Paginación `tasks?page=...`** | BAJO — performance tabla grande. | Añadir cuando superemos X jobs. | `Cola`. | Bajo. | Bajo. | **LATER**. |

### 3.1 NOW (en este redesign)

- Documentar en `MONEYPRINTERTURBO_ADAPTER.md` que el upstream avanzó a v1.3.8 y que el pin local es v1.3.7.
- No bumpamos `v1.3.7 → v1.3.8` en este redesign (es tarea separada con su propio test plan).
- NO se modifica el código de integración; se mantiene el contrato existente.

### 3.2 LATER (futuro, priorizado)

1. Wire de `cross_post_state`, `failed_stage`, `combined_videos` en el adapter de Flask para que el panel los reciba parseados.
2. Cuando se haga bump a v1.3.8, abrir Fase E.b con test plan y capability gates por provider.

### 3.3 REJECT

- AI Agent Skill MPT — no aporta a CH.
- Video projects (revision-aware) — complejidad sin ganancia V1.

---

## 4. Riesgos detectados en v1.3.8 que ya se mitigan en CH

| Riesgo upstream | Mitigación Control Hub |
|---|---|
| `custom_system_prompt` (libre) → XSS si se loguea/renderiza | El panel YA NO renderiza prompts como HTML sin escapar (verificado en `dashboard-view.test.ts:la página /panda renderiza con textContent y no con innerHTML`). El prompt llega como string plano. |
| Cross-post directo sin idempotencia | Adapter CH exige `idempotency_key` y `Publication` propio. Feature flag. |
| API keys LLM/TTS en config | `mptSettingsSchema` rechaza secretos y valores con `=` o `\n` (test rbac cubre). CH nunca serializa al bundle. |
| Costes no calclados | `mpt.cost_usd` en CH es `—` hasta tener tabla de precios documentada. |

---

## 5. Comando para re-verificar este inspection

```powershell
# 1. Confirmar SHA upstream actual
Invoke-RestMethod -Uri "https://api.github.com/repos/harry0703/MoneyPrinterTurbo/branches/main" |
  Select-Object -ExpandProperty commit |
  Select-Object sha, @{ Name="date"; E={ $_.commit.author.date } }, @{ Name="msg"; E={ $_.commit.message } }

# 2. Confirmar pin local (este repo)
cd platform\third_party\MoneyPrinterTurbo
git rev-parse HEAD                # cf5a3aedad1741d012152d355aa909d224fc4557

# 3. Diff de campos VideoParams entre v1.3.7 y v1.3.8 (no se hace en runtime; ya documentado §2)
```

---

**Fin del inspection.** Siguiente: actualizar `MONEYPRINTERTURBO_ADAPTER.md` con esta tabla resumida y `commit` atómico.