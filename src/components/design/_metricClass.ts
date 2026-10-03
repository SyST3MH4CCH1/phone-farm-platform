// TASK §6 — clasificación REAL/DERIVED/ESTIMATED/UNAVAILABLE por metric_key.
// Solo se clasifican aquí los metric_keys documentados en docs/observability/METRICS_CATALOG.md.
// La UI renderiza el valor o `—` según la clase (cf. METRICS_CATALOG §9).

export type MetricClass = 'REAL' | 'DERIVED' | 'ESTIMATED' | 'UNAVAILABLE';

// Clasificación manual hasta tener un schema versionado (Fase H posterior).
// Si una métrica aparece en la UI, debe estar en este mapa o ser rechazada.
const CLASS_MAP: Readonly<Record<string, MetricClass>> = {
  // REAL — medido directamente por el sistema (psutil / ADB / Flask / MPT).
  'system.cpu_percent': 'REAL',
  'system.ram_percent': 'REAL',
  'system.disk_percent': 'REAL',
  'system.uptime': 'REAL',
  'panel.flask_online': 'REAL',
  'panel.mpt_online': 'REAL',
  'panel.mcp_online': 'REAL',
  'devices.online_count': 'REAL',
  'devices.battery_percent': 'REAL',
  'devices.adb_latency_ms': 'REAL',
  'devices.heartbeat_age_s': 'REAL',
  'devices.temperature_c': 'REAL',
  'accounts.total_count': 'REAL',
  'accounts.active_count': 'REAL',
  'accounts.warmup_count': 'REAL',
  'accounts.paused_count': 'REAL',
  'accounts.error_count': 'REAL',
  'accounts.last_activity_at': 'REAL',
  'accounts.published_total': 'REAL',
  'accounts.published_today': 'REAL',
  'queue.queued_count': 'REAL',
  'queue.running_count': 'REAL',
  'queue.ready_count': 'REAL',
  'queue.publishing_count': 'REAL',
  'queue.completed_count': 'REAL',
  'queue.failed_count': 'REAL',
  'queue.success_rate_pct': 'REAL',
  'calendar.scheduled_today_count': 'REAL',
  'calendar.scheduled_24h_count': 'REAL',
  'calendar.published_count': 'REAL',
  'calendar.failed_count': 'REAL',
  'calendar.review_required_count': 'REAL',
  'mpt.online': 'REAL',
  'mpt.tasks_running': 'REAL',
  'mpt.tasks_completed_today': 'REAL',
  'mpt.tasks_failed_today': 'REAL',
  'mpt.videos_generated': 'REAL',
  'mpt.formats_used': 'REAL',
  'mpt.llm_provider': 'REAL',
  'mpt.tts_engine': 'REAL',
  'proxy.online_count': 'REAL',
  'proxy.total_count': 'REAL',
  'proxy.latency_ms': 'REAL',
  'proxy.last_rotation_at': 'REAL',
  'proxy.assigned_account': 'REAL',

  // DERIVED — requiere serie temporal histórica (no implementada todavía).
  // Se mostrará `—` en UI hasta que exista el bucket.
  'queue.runtime_p50_s': 'DERIVED',
  'queue.runtime_p95_s': 'DERIVED',
  'queue.wait_p50_s': 'DERIVED',
  'queue.wait_p95_s': 'DERIVED',
  'queue.throughput_per_hour': 'DERIVED',
  'mpt.runtime_avg_s': 'DERIVED',
  'devices.success_rate': 'DERIVED',

  // ESTIMATED — aproximado a partir de otras métricas; requiere decidir la
  // fórmula y marcarla en el catálogo antes de mostrarla.
  // (vacío por ahora; añadir solo cuando exista justificación)

  // UNAVAILABLE — explícitamente no se calcula. No se renderiza como cifra.
  // Las métricas sociales de cuentas (followers, likes) entran aquí hasta
  // que la API del proveedor las entregue; mpt.cost_usd hasta tener pricing.
  'accounts.followers_count': 'UNAVAILABLE',
  'accounts.engagement_rate': 'UNAVAILABLE',
  'accounts.posts_count': 'UNAVAILABLE',
  'mpt.cost_usd': 'UNAVAILABLE',
  'proxy.health_check_success_rate': 'UNAVAILABLE',
  'mpt.errors_by_stage': 'UNAVAILABLE',
};

export function classifyMetric(key: string): MetricClass {
  return CLASS_MAP[key] ?? 'UNAVAILABLE';
}