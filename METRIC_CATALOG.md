# METRIC_CATALOG — Phone Farm Control Hub

**Fecha:** 2026-10-03
**Versión:** 1.0
**Fuente de verdad para el frontend:** `src/components/design/_metricClass.ts`
**Catálogo complementario ( narrativo):** `docs/observability/METRICS_CATALOG.md`

> **PROHIBIDO inventar números. PROHIBIDO sustituir falta de datos por cifras
> ficticias.** Si no existe información, el estado UX es `"Sin datos"` o `—`,
> y la métrica se clasifica como `UNAVAILABLE` o `DERIVED` (pendiente de bucket).

---

## 0. Clasificación obligatoria

| Clase | Significado | Qué muestra la UI |
|---|---|---|
| **REAL DATA** | Medido directamente por el sistema (psutil, ADB, el propio servicio). | El número. |
| **DERIVED DATA** | Calculado a partir de datos reales que sí existen. | El número derivado. |
| **ESTIMATED DATA** | Aproximado desde otras métricas con una fórmula declarada. Solo si la fórmula está versionada y documentada. | El número estimado + marca `~`. |
| **UNAVAILABLE DATA** | No existe la fuente. No se calcula. | `—` / `"Sin datos"`. |

**Regla de render** (`_metricClass.ts` → `classifyMetric`):

- `UNAVAILABLE` → la UI **nunca** pide el campo ni lo pinta. Em-dash.
- `DERIVED` → la UI lo pinta solo si el bucket histórico existe; mientras tanto em-dash.
- `ESTIMATED` → marca visual obligatoria. **Hoy el catálogo no tiene ninguna.**

---

## 1. Sistema (host del panel)

| Campo | Valor |
|---|---|
| `metric_id` | `system.cpu_percent` |
| Nombre visible | CPU |
| Descripción | Porcentaje de uso de CPU del host donde corre el panel |
| Fuente real | `psutil.cpu_percent(interval=N)` vía Flask |
| Query / cálculo | `psutil.cpu_percent()` |
| Fórmula | Directa (sin transformación) |
| Unidad | `%` (0–100) |
| Periodo |_INSTANTE_ (muestra actual) |
| Refresh | 10 s (polling `/api/stats`) |
| Fallback | Si Flask está caído → `—` |
| Estado sin información | `—` + HealthIndicator "Flask offline" |
| Clasificación | **REAL** |
| Freshness | realtime |
| Chart | `progress` (capacidad actual) — TASK §6: progress → capacidad |
| Dónde se ve | `App.tsx` AnalyticsRow "Estado del host"; RingProgress en infra row |

| Campo | Valor |
|---|---|
| `metric_id` | `system.ram_percent` |
| Nombre visible | RAM |
| Descripción | Porcentaje de RAM usada del host |
| Fuente real | `psutil.virtual_memory().percent` |
| Query / cálculo | Directa |
| Fórmula | Directa |
| Unidad | `%` |
| Periodo | instante |
| Refresh | 10 s |
| Fallback | `—` |
| Estado sin información | `—` |
| Clasificación | **REAL** |
| Freshness | realtime |
| Chart | `progress` |
| Dónde se ve | Ídem CPU |

| Campo | Valor |
|---|---|
| `metric_id` | `system.disk_percent` |
| Nombre visible | Disco |
| Descripción | Porcentaje de uso del disco raíz |
| Fuente real | `psutil.disk_usage('/').percent` — **puede no venir** |
| Query / cálculo | Directa si el backend la expone |
| Fórmula | Directa |
| Unidad | `%` |
| Periodo | instante |
| Refresh | 30 s |
| Fallback | `—` (ya implementado con `typeof === 'number'`) |
| Estado sin información | `—` (nunca `0`) |
| Clasificación | **REAL** (cuando existe) |
| Freshness | near-realtime |
| Chart | `progress` |
| Nota TASK §6 | No se normaliza a "GB libres": el backend no entrega ese campo. |

| Campo | Valor |
|---|---|
| `metric_id` | `system.uptime` |
| Nombre visible | Uptime |
| Descripción | Segundos desde el arranque del proceso Flask |
| Fuente real | `time.time() - started_at` |
| Fórmula | Diferencia de timestamps |
| Unidad | segundos (se formatea a h/d) |
| Periodo | acumulado |
| Refresh | 60 s |
| Fallback | `—` |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | ninguno (texto) |

---

## 2. Servicios (health)

| Campo | Valor |
|---|---|
| `metric_id` | `panel.flask_online` |
| Nombre visible | Flask API |
| Descripción | Si el backend Python responde |
| Fuente real | `GET ${flaskBase}/api/drafts` con `X-Internal-Auth` |
| Fórmula | `r.ok` (booleano) |
| Unidad | bool |
| Periodo | instante |
| Refresh | 10 s (cache en `/api/stack`) |
| Fallback | `false` + badge `danger` |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `status` (HealthIndicator), no chart numérico |

| Campo | Valor |
|---|---|
| `metric_id` | `panel.mpt_online` |
| Nombre visible | MoneyPrinterTurbo |
| Descripción | Si MPT responde `/ping` |
| Fuente real | `GET ${mptApiUrl}/ping` |
| Fórmula | `res.ok` |
| Unidad | bool |
| Periodo | instante |
| Refresh | 10 s |
| Fallback | `false` |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `status` |

| Campo | Valor |
|---|---|
| `metric_id` | `panel.mcp_online` |
| Nombre visible | MCP server |
| Descripción | Si el MCP server (:5001) escucha |
| Fuente real | Indirecto: hoy se infiere de `stack.native/containers` |
| Fórmula | — |
| Unidad | bool |
| Refresh | 10 s |
| Clasificación | **UNAVAILABLE** (no hay endpoint directo) |
| Estado sin información | `—` |

---

## 3. Dispositivos (ADB)

| Campo | Valor |
|---|---|
| `metric_id` | `devices.online_count` |
| Nombre visible | Dispositivos |
| Descripción | Teléfonos Android conectados por ADB |
| Fuente real | `adb devices -l` (allowlist) |
| Query / cálculo | `count(state == 'device')` |
| Fórmula | Longitud de la lista filtrada |
| Unidad | count |
| Periodo | instante |
| Refresh | 5 s |
| Fallback | `0` con subtitle "Sin dispositivos ADB" |
| Clasificación | **REAL** |
| Freshness | realtime |
| Chart | ninguno (contador) |

| Campo | Valor |
|---|---|
| `metric_id` | `devices.battery_percent` |
| Nombre visible | Batería |
| Descripción | Nivel de batería por dispositivo |
| Fuente real | `adb shell dumpsys battery` |
| Fórmula | Directa |
| Unidad | `%` |
| Periodo | bajo demanda |
| Refresh | manual (botón Test) |
| Clasificación | **REAL** |
| Freshness | bajo demanda |
| Chart | `progress` por dispositivo |

| Campo | Valor |
|---|---|
| `metric_id` | `devices.adb_latency_ms` |
| Nombre visible | Latencia ADB |
| Descripción | RTT de un `adb shell echo` |
| Fuente real | `time.perf_counter()` antes/después |
| Fórmula | `t1 - t0` |
| Unidad | ms |
| Periodo | bajo demanda |
| Refresh | manual |
| Clasificación | **REAL** |
| Freshness | bajo demanda |
| Chart | `sparkline` si se acumula histórico; hoy texto |

| Campo | Valor |
|---|---|
| `metric_id` | `devices.heartbeat_age_s` |
| Nombre visible | Heartbeat |
| Descripción | Segundos desde el último latido del dispositivo |
| Fuente real | `last_heartbeat_at` |
| Fórmula | `now - last_heartbeat` |
| Unidad | segundos |
| Periodo | instante |
| Refresh | 5 s |
| Clasificación | **REAL** |
| Freshness | realtime |
| Chart | texto (`formatRelativeTime`) |

| Campo | Valor |
|---|---|
| `metric_id` | `devices.temperature_c` |
| Nombre visible | Temperatura |
| Descripción | Temperatura del SoC |
| Fuente real | `adb shell dumpsys thermalservice` — **no siempre soportado** |
| Clasificación | **UNAVAILABLE** si el dispositivo no lo expone |
| Estado sin información | `—` |
| Freshness | bajo demanda |

| Campo | Valor |
|---|---|
| `metric_id` | `devices.success_rate` |
| Nombre visible | Tasa de éxito del dispositivo |
| Descripción | Workflows exitosos / total |
| Fórmula | `successful_runs / total_runs` |
| Periodo | rolling 24 h |
| Refresh | 5 min |
| Clasificación | **DERIVED** (requiere bucket histórico) |
| Estado sin información | `—` hasta que exista el bucket |
| Freshness | histórica |

---

## 4. Cuentas

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.total_count` |
| Nombre visible | Cuentas |
| Descripción | Cuentas registradas en la farm |
| Fuente real | `accounts.json` (Flask) |
| Fórmula | `length` |
| Unidad | count |
| Refresh | 10 s |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | ninguno (contador) |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.active_count` |
| Nombre visible | Cuentas activas |
| Descripción | Cuentas con `status === 'active'` |
| Fórmula | `count(status == 'active')` |
| Unidad | count |
| Refresh | 10 s |
| Fallback | `0` con subtitle "Sin cuentas registradas" |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `progress` (ratio activas/total) — TASK §6: progress → capacidad |
| Nota | **Prohibido** `|| 4` o cualquier fallback inventado. Corregido. |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.warmup_count` / `paused_count` / `error_count` |
| Nombre visible | Warmup / Pausadas / Con error |
| Fórmula | `count(status == X)` |
| Unidad | count |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `bar` (distribución por estado) |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.last_activity_at` |
| Nombre visible | Última actividad |
| Fórmula | Campo `last_activity` (ISO 8601) |
| Unidad | timestamp |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | texto relativo (`formatRelativeTime`) |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.published_total` |
| Nombre visible | Publicaciones |
| Descripción | Jobs publicados **histórico total** de la cuenta |
| Fórmula | `count(queue where target_account == id and status == 'published')` |
| Unidad | count |
| Periodo | histórico (sin corte) |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.published_today` |
| Nombre visible | — (no se muestra aún) |
| Descripción | Publicaciones con `published_at` dentro del día |
| Fórmula | requiere campo `published_at` por job — **NO EXISTE AÚN** |
| Clasificación | **UNAVAILABLE** |
| Estado sin información | `—` |
| Nota | El requisito §16 del prompt: "solo considerar TASK completado cuando… datos reales o explícitamente sin datos". Esta métrica **no se inventa**; se deja como `UNAVAILABLE` hasta añadir `published_at`. La stat actual se titula "Publicaciones" (histórico), NO "Publicaciones hoy". |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.followers_count` |
| Nombre visible | Seguidores |
| Descripción | Seguidores en la plataforma social |
| Fuente real | API de Instagram/TikTok — **el backend no lo pide** |
| Clasificación | **UNAVAILABLE** |
| Estado sin información | `—` |
| Historia | Antes renderizaba `followers_count \|\| 4820` (FAKE). Corregido en `5c8c956`. |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.engagement_rate` |
| Clasificación | **UNAVAILABLE** |
| Historia | Antes `engagement_rate \|\| 4.8` (FAKE). Corregido. |

| Campo | Valor |
|---|---|
| `metric_id` | `accounts.likes_today` / `follows_today` / `comments_today` |
| Clasificación | **UNAVAILABLE** (el backend no los puebla de forma fiable) |
| Historia | Antes `\|\| 24`, `\|\| 12`, `\|\| 5` (FAKES). Corregidos. |

---

## 5. Cola / Jobs

| Campo | Valor |
|---|---|
| `metric_id` | `queue.queued_count` |
| Nombre visible | Queued |
| Fórmula | `count(status == 'pending')` |
| Unidad | count |
| Refresh | 10 s |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `bar` (bucket del pipeline) |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.running_count` |
| Nombre visible | Generating |
| Fórmula | `count(status in [scripting, generating, awaiting_approval, awaiting_preview])` |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `bar` + `progress` por job |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.ready_count` |
| Nombre visible | Ready |
| Fórmula | `count(status == 'ready_for_publish')` |
| Clasificación | **REAL** |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.publishing_count` |
| Nombre visible | Publishing |
| Fórmula | `count(status == 'publishing')` |
| Clasificación | **REAL** |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.completed_count` |
| Nombre visible | Done |
| Fórmula | `count(status == 'published')` |
| Clasificación | **REAL** |
| Periodo | histórico |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.failed_count` |
| Nombre visible | Fail |
| Fórmula | `count(status in [failed, rejected, awaiting_manual_upload])` |
| Clasificación | **REAL** |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.success_rate_pct` |
| Nombre visible | Tasa de éxito |
| Descripción | Porcentaje de jobs no fallidos |
| Fórmula | `100 - (errores / max(1, queue.length)) * 100` |
| Unidad | `%` |
| Periodo | rolling |
| Refresh | 10 s |
| Clasificación | **DERIVED** |
| Freshness | near-realtime |
| Chart | `donut` — **solo válido porque es parte-de-un-total real** (TASK §6: donut solo con parte-de-total) |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.runtime_p50_s` / `runtime_p95_s` |
| Descripción | Mediana / p95 de duración de job |
| Fórmula | percentil sobre `runtime_seconds` |
| Periodo | rolling 24 h |
| Refresh | 5 min |
| Clasificación | **DERIVED** |
| Estado sin información | `—` (no existe bucket de runtime) |
| Chart | `line` (cuando exista) |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.wait_p50_s` / `wait_p95_s` |
| Fórmula | percentil sobre `scheduled_ts - created_at` |
| Clasificación | **DERIVED** |
| Estado sin información | `—` |
| Chart | `line` |

| Campo | Valor |
|---|---|
| `metric_id` | `queue.throughput_per_hour` |
| Fórmula | publicaciones / hora |
| Periodo | rolling 1 h |
| Clasificación | **DERIVED** |
| Estado sin información | `—` |
| Chart | `line` |

---

## 6. Calendario / Publicación

| Campo | Valor |
|---|---|
| `metric_id` | `calendar.scheduled_today_count` |
| Nombre visible | Programadas hoy |
| Fórmula | `count(scheduled_ts in [hoy 00:00, mañana 00:00))` |
| Unidad | count |
| Refresh | 10 s |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `bar` (7 días) — implementado en AnalyticsRow |
| Dónde se ve | `AnalyticsRow` "Actividad por día (7d)" |

| Campo | Valor |
|---|---|
| `metric_id` | `calendar.scheduled_24h_count` |
| Nombre visible | Próximas 24 h |
| Fórmula | `count(scheduled_ts in [now, now+24h))` |
| Clasificación | **REAL** |
| Chart | lista (`UpcomingPublications`) |

| Campo | Valor |
|---|---|
| `metric_id` | `calendar.published_count` / `failed_count` (por periodo) |
| Clasificación | **REAL** |
| Nota | Requieren `published_at` para filtrar por periodo → hoy sin filtro temporal. |

| Campo | Valor |
|---|---|
| `metric_id` | `calendar.review_required_count` |
| Nombre visible | Requieren revisión |
| Fórmula | `count(status == 'awaiting_approval')` |
| Clasificación | **REAL** |
| Chart | `bar` + `AlertRow` accionable |

---

## 7. MoneyPrinterTurbo

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.online` |
| Nombre visible | MPT |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `status` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.tasks_running` |
| Nombre visible | Tasks en curso |
| Fuente real | `/api/moneyprinter/tasks` → `state == 'running'` |
| Clasificación | **REAL** |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.tasks_completed_today` / `tasks_failed_today` |
| Clasificación | **DERIVED** (requiere `finished_at` en la task) |
| Estado sin información | `—` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.runtime_avg_s` |
| Clasificación | **DERIVED** |
| Estado sin información | `—` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.videos_generated` |
| Clasificación | **REAL** (conteo de artefactos en disco) |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.formats_used` |
| Clasificación | **REAL** (`9:16 / 16:9 / 1:1`) |
| Chart | `bar` |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.llm_provider` / `mpt.tts_engine` |
| Clasificación | **REAL** (strings de config) |
| Chart | texto |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.cost_usd` |
| Descripción | Coste monetario de la generación |
| Fuente real | **NO EXISTE.** No hay tabla de precios versionada. |
| Clasificación | **UNAVAILABLE** |
| Estado sin información | `—` (obligatorio; nunca un número estimado) |

| Campo | Valor |
|---|---|
| `metric_id` | `mpt.errors_by_stage` |
| Clasificación | **UNAVAILABLE** (requiere parsear `failed_stage` de v1.3.8, no pinneado) |

---

## 8. Proxies

| Campo | Valor |
|---|---|
| `metric_id` | `proxy.total_count` / `proxy.online_count` |
| Fórmula | `length` / `count(status == 'online')` |
| Clasificación | **REAL** |
| Freshness | near-realtime |
| Chart | `progress` (ratio online/total) |

| Campo | Valor |
|---|---|
| `metric_id` | `proxy.latency_ms` |
| Descripción | RTT al upstream del proxy |
| Fuente real | Verificación real (`/api/proxies/verify`) |
| Unidad | ms |
| Periodo | bajo demanda (cache 60 s) |
| Clasificación | **REAL** |
| Freshness | bajo demanda |
| Fallback | `—` si nunca se verificó (ya implementado) |
| Chart | `bar` (comparación entre proxies) — no `line`: no hay serie temporal |

| Campo | Valor |
|---|---|
| `metric_id` | `proxy.health_check_success_rate` |
| Clasificación | **UNAVAILABLE** (requiere histórico de checks) |
| Estado sin información | `—` |

| Campo | Valor |
|---|---|
| `metric_id` | `proxy.last_rotation_at` |
| Clasificación | **REAL** (campo persistido) |
| Chart | texto relativo |

---

## 9. Mapa métrica → tipo de chart (TASK §6)

| Tipo de chart | Cuándo se usa | Métricas |
|---|---|---|
| `line` | Serie temporal (≥2 puntos en el tiempo) | `queue.runtime_p50/p95_s`, `queue.wait_p50/p95_s`, `queue.throughput_per_hour`, `devices.adb_latency_ms` (si se acumula) |
| `bar` | Comparación entre categorías | buckets del pipeline, estados de cuenta, `proxy.latency_ms`, `calendar.scheduled_today_count` |
| `stacked bar` | Composición de un total | `accounts` por estado (active/warmup/paused/error) — **LATER** |
| `donut/pie` | **Solo** si existe parte-de-un-total real | `queue.success_rate_pct` (published / failed / en curso) |
| `progress` | Capacidad o avance | `system.cpu_percent`, `system.ram_percent`, `system.disk_percent`, `accounts.active_count`, `proxy.online_count`, batería |
| `sparkline` | Tendencia secundaria dentro de una tabla | pendiente de bucket |
| `heatmap` | Distribución temporal cuando los datos lo permitan | Actividad de `scheduled_ts` (implementado, 13 semanas) |
| `status` (no chart) | Booleanos de salud | `panel.*_online`, `mpt.online` |

---

## 10. Persistencia para series temporales (TASK §6.2 — sin sobre-ingeniería)

**Hoy**: no hay series temporales. Los charts de `line` dependen de un bucket
que no existe → muestran `—` / empty state.

**Propuesta mínima cuando se implemente** (no Prometheus, no Grafana — el TASK
lo desaconseja explícitamente para 4 teléfonos):

```text
MetricSample
- metric_key    (fk lógico al catálogo)
- scope_type    (system | device | account | job | proxy)
- scope_id      nullable
- value         number
- unit          string
- recorded_at   ISO 8601
```

- Muestreo en memoria cada 5–10 s.
- Persistencia en buckets de 60 s.
- Retención 7–30 días según volumen real.
- Solo cuando una métrica `DERIVED` pase a `REAL` en la práctica.

---

## 11. Invariantes verificadas por tests

| Invariante | Test |
|---|---|
| `classifyMetric` devuelve `UNAVAILABLE` para métricas sin fuente | `test/design-system.test.ts` |
| `followers_count`, `engagement_rate`, `mpt.cost_usd`, `health_check_success_rate` siguen `UNAVAILABLE` | `test/design-system.test.ts` |
| `formatPercent/Bytes/Latency` devuelven `—` ante `null/undefined/NaN/Infinity` | `test/design-system.test.ts` |
| Los charts **no interpolan huecos** (`toSegments` abre la línea) | `test/chart-logic.test.ts` |
| La consola **redacta** secretos | `test/redact-secrets.test.ts` |

---

## 12. Métricas explícitamente NO disponibles (TASK §0)

Estas **nunca** se inventan. Si la UI las necesita, muestra `—`:

`accounts.followers_count` · `accounts.engagement_rate` · `accounts.likes_today` ·
`accounts.follows_today` · `accounts.comments_today` · `accounts.published_today` ·
`accounts.posts_count` · `queue.runtime_p50_s` · `queue.runtime_p95_s` ·
`queue.wait_p50_s` · `queue.wait_p95_s` · `queue.throughput_per_hour` ·
`proxy.health_check_success_rate` · `mpt.cost_usd` · `mpt.errors_by_stage` ·
`mpt.tasks_completed_today` · `mpt.tasks_failed_today` · `mpt.runtime_avg_s` ·
`panel.mcp_online` · `devices.temperature_c` (si el dispositivo no lo expone)

---

**Fin del catálogo.** Cualquier métrica nueva en el panel debe añadirse aquí
**antes** de implementarse, con su `source` real. Si no hay fuente real, la
métrica se clasifica `UNAVAILABLE` y la UI muestra `—`.
