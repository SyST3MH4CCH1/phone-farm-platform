# MoneyPrinterTurbo Adapter — Contract & Pin

**Fecha:** 2026-10-03
**Versión:** 1.0
**Motivación:** TASK_UI_UX_REAL_CONTROL_HUB_V1 §13 — MoneyPrinterTurbo se mantiene como servicio aislado detrás de un adapter/provider, sin convertirse en dominio de Control Hub.

---

## 1. Pin upstream

| Campo | Valor |
|---|---|
| Repositorio | `https://github.com/harry0703/MoneyPrinterTurbo` |
| SHA pin | `cf5a3aedad1741d012152d355aa909d224fc4557` |
| Tag upstream observado | (no se fija tag; se trabaja contra SHA) |
| Versión pyproject | `1.3.7` |
| License | MIT (Copyright 2024 Harry) |
| License hash | derivado de `LICENSE` — texto verificado: "MIT License Copyright (c) 2024 Harry" |
| Fecha de pin | 2026-10-03 |
| Estrategia de update | bump manual cuando se quiera actualizar; nunca automático. Cada cambio debe pasar por Gate E (test smoke + verificación del adapter). |

> **Cómo verificar manualmente:**
> ```powershell
> cd platform\third_party\MoneyPrinterTurbo
> git rev-parse HEAD                # → cf5a3aedad1741d012152d355aa909d224fc4557
> git log -1 --oneline              # debe coincidir con el pin
> ```

## 2. Arquitectura — Adapter/provider

```
ControlHub UI
   ↓ HTTP (cookie pf_session + CSRF)
Express panel (server/app.ts)        ← proxy autenticado
   ↓ X-Internal-Auth + X-Actor + X-Role
Flask (platform/phonefarm/content.py + generator.py) ← ContentProvider / MoneyPrinterTurboAdapter
   ↓ HTTP loopback (bearer token interno)
MoneyPrinterTurbo :8080 (FastAPI)
```

**Reglas:**

1. El panel React **nunca** habla con MPT directamente. Solo con `/api/moneyprinter/*` (Express) o `/api/moneyprinter/*` (Flask). MPT solo es accesible por loopback desde Flask.
2. El dominio canónico de Control Hub permanece: `Content`, `ContentJob`, `Account`, `Publication`, `audit`. Los identificadores MPT (`provider_task_id`) se almacenan como referencia, **no** como clave primaria.
3. Credenciales (LLM API keys, Pexels, TTS) **nunca** salen del backend. La UI solo ve `llm_provider` y `llm_model` (strings), no las keys.
4. Reintento, idempotencia y reconciliación se hacen en Flask (`generator.py`). El panel solo refleja el estado.

## 3. Endpoints MPT que el adapter invoca

(Verificado contra `pyproject.toml v1.3.7` y `app/controllers/v1/*`; el adapter los consulta por HTTP loopback.)

| Método | Path | Uso en el adapter |
|---|---|---|
| `POST` | `/api/v1/videos` | Crear tarea de generación (subject, script, materiales, voz, subtítulos, BGM, formato). |
| `POST` | `/api/v1/subtitle` | Generar subtítulos (provider edge o Whisper). |
| `POST` | `/api/v1/audio` | Generar audio TTS. |
| `GET`  | `/api/v1/tasks` | Listar tareas (auditoría). |
| `GET`  | `/api/v1/tasks/{task_id}` | Estado actual de una tarea (polling / SSE MPT). |
| `DELETE` | `/api/v1/tasks/{task_id}` | Cancelar/borrar tarea. |
| `GET/POST` | `/api/v1/musics` | Listado y subida de BGM. |
| `GET/POST` | `/api/v1/video_materials` | Materiales (Pexels/Pixabay/local/AI). |
| `GET` | `/ping` | Health check usado por `/api/stack.mpt_online` (Express, cache 10 s). |

> El adapter NUNCA expone los secrets a la UI. La respuesta del panel contiene solo:
>
> - `provider_name: 'moneyprinterturbo'`
> - `provider_task_id: <uuid>`
> - `provider_status: <mapeado a estados canónicos>`
> - `progress: number` (cuando se puede calcular).
> - `artifacts: { video?, audio?, final_video? }` con rutas internas del backend.
> - `error: string` (sanitizado, sin filtrar paths internos ni secretos).

## 4. Mapping de estados MPT → estados canónicos de Control Hub

| Estado MPT (upstream) | Estado ControlHub (`QueueJob.status`) | Notas |
|---|---|---|
| `pending` / `queued` | `pending` | Job en cola en MPT. |
| `running` / `processing` | `generating` | Adapter sigue con `/api/v1/tasks/{id}` cada N s. |
| `awaiting_approval` (MPT interno) | `awaiting_approval` | Adapter lo expone; UI muestra acción "Aprobar". |
| `completed` (MPT) | `ready_for_publish` | Adapter descarga artefacto y lo guarda en `platform/videos/`. |
| `failed` (MPT) | `failed` | Adapter registra `error` sanitizado. |
| (cancelado por adapter) | `rejected` | |

> El adapter reconcilia por polling (5–10 s) y por evento SSE de MPT cuando existe (`/api/v1/tasks/{id}/events` si está disponible en la versión pinneada; si no, polling).

## 5. Política de secretos

- `MINIMAX_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `DASHSCOPE_API_KEY` → `platform/.env` (no committeado).
- Carga en Flask vía `os.getenv(...)` en `platform/phonefarm/generator.py` y `platform/phonefarm/content.py`.
- **Nunca** se serializan al JSON de respuesta. El endpoint `/api/moneyprinter/config` valida con `mptSettingsSchema` que rechaza secretos y valores con `=` o saltos de línea (test `rbac.test.ts:moneyprinter/config rechaza secretos y valores con '=' o saltos de línea` cubre el caso).
- Audit trail en `audit.jsonl` registra `actor`, `role`, `action` (publish, generate, cancel), `object` (job_id) — **no** registra la API key.

## 6. Cross-post (publicación)

MPT upstream observado incluye cross-post vía `Upload-Post` para TikTok/Instagram/YouTube Shorts. **Política Control Hub:**

- Cross-post NUNCA se invoca desde la UI como atajo.
- Si se quiere aprovechar, **debe** ir por un `PublishingProvider` separado:
  ```text
  PublishingProvider
    └── MptUploadPostAdapter (feature flag OFF por defecto)
  ```
- Cada ejecución crea/reconcilia un `Publication` propio con:
  - `platform`, `account_id`, `content_id`, `provider_request_id`,
  - `idempotency_key` (UUID v4 derivado de `(job_id, account_id, scheduled_ts)`),
  - `state`, `remote_result`, `timestamps`, `error/retry_state`.
- Permanece OFF por feature flag hasta superar el capability gate de publishing (TASK §13.3 Gate E).

## 7. Gate E (TASK §25)

Para declarar Fase E cerrada:

- [x] Pin upstream registrado en este documento y en `REPOSITORY_REGISTRY.md` si existe.
- [x] Adapter expone solo metadatos (no secretos).
- [x] Mapping de estados documentado.
- [ ] Test smoke E2E en CI: crear tarea MPT → poll → reconciliar → ver estado en UI. Pendiente para Fase H.
- [ ] Generar al menos un vídeo end-to-end desde Control Hub (manual, en host con GPU; no bloqueante para el redesign).

## 8. Endpoints del panel expuestos (referencia rápida)

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/api/moneyprinter/config` | Lee config persistida (sin secretos). |
| `POST` | `/api/moneyprinter/config` | Persiste config validada por schema. |
| `GET` | `/api/moneyprinter/tasks` | Lista de tasks MPT (cache 10 s). |
| `GET` | `/api/moneyprinter/tasks/{id}` | Estado de un task concreto. |
| `POST` | `/api/moneyprinter/generate` | Alias del flujo `queue/next` + MPT (validación `mptSettingsSchema`). |
| `POST` | `/api/moneyprinter/cancel` | (Pendiente; añadir cuando adapter lo soporte.) |

---

**Fin del adapter.** Cualquier nueva capacidad MPT debe (1) añadir endpoint aquí, (2) actualizar mapping de estados, (3) verificar que no filtra secretos en la respuesta.