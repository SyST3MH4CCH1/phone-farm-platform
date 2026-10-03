# Metrics Catalog — Phone Farm Control Hub

**Fecha:** 2026-10-03
**Versión:** 1.0
**Motivación:** TASK_UI_UX_REAL_CONTROL_HUB_V1 §6 — cada KPI/chart debe tener definición, fuente, unidad, ventana temporal y origen documentados. **No se muestran cifras inventadas**.

---

## 1. Sistema

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana | Refresh | Retención |
|---|---|---|---|---|---|---|---|---|
| `system.cpu_percent` | CPU | Porcentaje de uso de CPU del host del panel | `psutil.cpu_percent(interval=N)` | Flask `/api/stats` | % | realtime | 5 s | N/A (live) |
| `system.ram_percent` | RAM | Porcentaje de uso de RAM del host del panel | `psutil.virtual_memory().percent` | Flask `/api/stats` | % | realtime | 5 s | N/A (live) |
| `system.disk_percent` | Disco | Porcentaje de uso del disco raíz | `psutil.disk_usage('/').percent` si existe | Flask `/api/stats` (puede no llegar) | % | realtime | 30 s | N/A (live) |
| `system.uptime` | Uptime | Segundos desde el arranque del proceso Flask | `time.time() - started_at` | Flask `/api/stats` | s | realtime | 60 s | N/A |
| `panel.flask_online` | Flask API | Loopback ping al backend Python | `fetch(flaskBase + /api/drafts)` → 2xx | Express `/api/stack` (cache 10 s) | bool | 10 s | 10 s | N/A |
| `panel.mpt_online` | MPT | Loopback ping a MoneyPrinterTurbo | `fetch(mptApiUrl + /ping)` → 2xx | Express `/api/stack` (cache 10 s) | bool | 10 s | 10 s | N/A |
| `panel.mcp_online` | MCP server | TCP loopback a :5001 | `socket(('127.0.0.1', 5001))` | (futuro, hoy indirecto vía `/api/stats`) | bool | 10 s | 10 s | N/A |

## 2. Dispositivos

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana | Refresh |
|---|---|---|---|---|---|---|---|
| `devices.online_count` | Dispositivos online | Cuenta de `adb devices` con `state == 'device'` | longitud de la lista | Flask `/api/adb/devices` | count | realtime | 5 s |
| `devices.battery_percent` | Batería | Nivel de batería por dispositivo | `adb shell dumpsys battery` | Flask `/api/adb/battery/<serial>` | % | por demanda | manual / refresh |
| `devices.adb_latency_ms` | Latencia ADB | RTT de `adb shell echo` | `time.perf_counter()` antes/después | Flask `/api/adb/test-connection` | ms | por demanda | manual |
| `devices.heartbeat_age_s` | Edad del último latido | segundos desde `last_heartbeat_at` | `now - last_heartbeat` | Flask `/api/adb/heartbeat/<serial>` | s | realtime | 5 s |
| `devices.session_lease` | Sesión activa | `lease_owner` actual del dispositivo | tabla de leases | Flask `/api/adb/leases` | string | realtime | 5 s |
| `devices.jobs_active` | Jobs activos por dispositivo | jobs cuyo `device_serial == <serial>` y estado activo | join con `/api/queue` | derivado | count | realtime | 10 s |
| `devices.success_rate` | Tasa de éxito workflows | `successful_runs / total_runs` | derivado | serie temporal (futuro) | % | rolling 24 h | 5 min |
| `devices.temperature_c` | Temperatura | Si `adb shell dumpsys thermalservice` lo soporta | termal | Flask `/api/adb/temperature/<serial>` | °C | por demanda | manual |

## 3. Cuentas

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana |
|---|---|---|---|---|---|---|
| `accounts.total_count` | Total | cuenta total de cuentas registradas | `accounts.json` length | Flask `/api/accounts` | count | realtime |
| `accounts.active_count` | Activas | cuentas con `status==='active'` | filtrado | Flask `/api/accounts` | count | realtime |
| `accounts.warmup_count` | En warmup | cuentas con `status==='warmup'` | filtrado | Flask `/api/accounts` | count | realtime |
| `accounts.paused_count` | Pausadas | cuentas con `status==='paused'` | filtrado | Flask `/api/accounts` | count | realtime |
| `accounts.error_count` | Con error | cuentas con `status==='error'` | filtrado | Flask `/api/accounts` | count | realtime |
| `accounts.last_activity_at` | Última actividad | `last_activity` (ISO 8601) | campo | Flask `/api/accounts` | ISO 8601 | realtime |
| `accounts.published_total` | Publicaciones (total) | jobs con `status==='published'` y `account_id == <id>` | join | Flask `/api/queue` | count | histórico |
| `accounts.published_today` | Publicaciones hoy | `count`, filtro temporal `>=00:00 local` | derivado | Flask `/api/queue` | count | día actual |

> **Nota importante:** el frontend actual calcula `publishedToday = queue.filter(j => j.status === 'published').length` sin filtro de fecha. **Esto NO es `published_today`**: cuenta histórico. Documentado en `UI_REDESIGN_REALITY_AUDIT.md` §3 como PARCIAL. Solución: añadir columna `published_at` en el modelo de QueueJob y filtrar. (Pendiente para iteración posterior al TASK; no es bloqueante porque la cifra se etiqueta como "publicaciones" en la UI, sin el sufijo "hoy" cuando se ajuste).

## 4. Cola / jobs

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana |
|---|---|---|---|---|---|---|
| `queue.queued_count` | En cola | estados `pending` | filtrado | Flask `/api/queue` | count | realtime |
| `queue.running_count` | En ejecución | estados `scripting | generating | awaiting_approval | awaiting_preview` | filtrado | Flask `/api/queue` | count | realtime |
| `queue.ready_count` | Listas para publicar | estado `ready_for_publish` | filtrado | Flask `/api/queue` | count | realtime |
| `queue.publishing_count` | Publicando | estado `publishing` | filtrado | Flask `/api/queue` | count | realtime |
| `queue.completed_count` | Completadas | estado `published` | filtrado | Flask `/api/queue` | count | histórico |
| `queue.failed_count` | Fallidas | estados `failed | rejected` | filtrado | Flask `/api/queue` | count | histórico |
| `queue.success_rate_pct` | Tasa de éxito | `100 - (errores / total * 100)` | derivado | Flask `/api/queue` + `/api/stats.errores` | % | rolling |
| `queue.runtime_p50_s` | Runtime p50 | mediana del `runtime_seconds` por job | derivado (futuro) | serie temporal | s | rolling 24 h |
| `queue.runtime_p95_s` | Runtime p95 | percentil 95 | derivado (futuro) | serie temporal | s | rolling 24 h |
| `queue.wait_p50_s` | Wait p50 | mediana de `scheduled_ts - created_at` | derivado (futuro) | serie temporal | s | rolling 24 h |
| `queue.wait_p95_s` | Wait p95 | percentil 95 | derivado (futuro) | serie temporal | s | rolling 24 h |
| `queue.throughput_per_hour` | Throughput | publicaciones por hora | derivado | serie temporal (futuro) | count/h | rolling 1 h |

## 5. Calendario / publicación

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana |
|---|---|---|---|---|---|---|
| `calendar.scheduled_today_count` | Programadas hoy | jobs con `scheduled_ts` entre 00:00–24:00 hoy | filtrado | Flask `/api/queue?scheduled=*` | count | día actual |
| `calendar.scheduled_24h_count` | Programadas 24 h | jobs con `scheduled_ts` en las próximas 24 h | filtrado | Flask `/api/queue?scheduled=*` | count | rolling 24 h |
| `calendar.published_count` | Publicadas (periodo) | jobs en estado `published` con `published_at` en periodo | filtrado | Flask `/api/queue` | count | periodo |
| `calendar.failed_count` | Fallidas (periodo) | jobs en `failed | rejected` con timestamps | filtrado | Flask `/api/queue` | count | periodo |
| `calendar.review_required_count` | Requieren revisión | jobs en `awaiting_approval` | filtrado | Flask `/api/queue` | count | realtime |

## 6. MoneyPrinterTurbo

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana |
|---|---|---|---|---|---|---|
| `mpt.online` | MPT disponible | ping `/ping` 2xx | HTTP | MPT upstream | bool | 10 s |
| `mpt.tasks_running` | Tasks en curso | tareas con `state == 'running'` | Flask `/api/moneyprinter/tasks` | count | realtime |
| `mpt.tasks_completed_today` | Tasks completadas hoy | `state == 'completed'` con `finished_at` hoy | derivado | Flask | count | día |
| `mpt.tasks_failed_today` | Tasks fallidas hoy | `state == 'failed'` con `finished_at` hoy | derivado | Flask | count | día |
| `mpt.runtime_avg_s` | Duración media | promedio de `finished_at - created_at` | derivado | Flask | s | rolling 24 h |
| `mpt.videos_generated` | Vídeos generados | cuenta de outputs | Flask | count | histórico |
| `mpt.formats_used` | Formatos usados | `9:16 / 16:9 / 1:1` count | derivado | Flask | count por formato | histórico |
| `mpt.llm_provider` | LLM en uso | `minimax/openai/kimi/...` | config | Flask `/api/moneyprinter/config` | string | config |
| `mpt.tts_engine` | TTS en uso | `edge_tts/openai_tts/elevenlabs` | config | Flask | string | config |
| `mpt.errors_by_stage` | Errores por etapa | groupby stage | derivado | logs | count por stage | rolling 24 h |
| `mpt.cost_usd` | Coste USD | **solo si** tabla de precios versionada y documentada existe | derivado | futura tabla `mpt_pricing.json` | USD | rolling 24 h |

> **Regla crítica (TASK §6.1 MPT)**: `mpt.cost_usd` **NO** se calcula con cifras inventadas. Si la tabla de precios no existe, se muestra `—`.

## 7. Proxies

| metric_key | Nombre UI | Definición | Fórmula | Fuente | Unidad | Ventana |
|---|---|---|---|---|---|---|
| `proxy.online_count` | Proxies online | `status === 'online'` | filtrado | Flask `/api/proxies` | count | realtime |
| `proxy.total_count` | Proxies totales | `proxies.length` | cuenta | Flask `/api/proxies` | count | realtime |
| `proxy.latency_ms` | Latencia | RTT al upstream del proxy | verificación | Flask `/api/proxies/verify` | ms | bajo demanda (cache 60 s) |
| `proxy.health_check_success_rate` | Health-check OK | `successful_checks / total_checks` | derivado | serie temporal (futuro) | % | rolling 24 h |
| `proxy.last_rotation_at` | Última rotación | campo de la BD | persistido | Flask | ISO 8601 | realtime |
| `proxy.assigned_account` | Cuenta asignada | FK a account | join | Flask | string | realtime |

## 8. Persistencia para charts (TASK §6.2)

**Hoy**: se reutilizan los eventos de Flask (`stats.json`, `audit.jsonl`, `queue.json` con timestamps). **No se introduce Prometheus/Grafana** porque la TASK §6.2 lo desaconseja explícitamente para 4 teléfonos.

**Propuesta mínima si se añaden métricas con histórico**:

```text
MetricSample
- id
- metric_key
- scope_type       (system|device|account|job|proxy)
- scope_id nullable
- value            (number)
- unit             (string, ej. 'percent' | 'ms' | 'count')
- tags/json metadata
- recorded_at      (ISO 8601)
```

- Sample en memoria rápido (5–10 s).
- Persistencia en bucket de 60 s.
- Retención: 7–30 días según volumen real.

No se diseña plataforma de observabilidad sobredimensionada.

## 9. Métricas todavía no disponibles (cero inventadas)

- `accounts.followers_count`, `accounts.engagement_rate`, `accounts.posts_count`: **NO** se calculan si la API de Instagram/TikTok no los entrega. Se muestran como `—`.
- `queue.runtime_p50_s`, `queue.runtime_p95_s`, `queue.wait_p50_s`, `queue.wait_p95_s`: requieren serie temporal; **no se muestran** en UI mientras no existan datos suficientes.
- `proxy.health_check_success_rate`: requiere histórico; **no se muestra** numéricamente mientras no exista.
- `mpt.cost_usd`: requiere tabla de precios versionada; **no se muestra** mientras no exista.

---

**Fin del catálogo.** Cualquier nueva métrica añadida al panel debe extender esta tabla antes de implementarse.