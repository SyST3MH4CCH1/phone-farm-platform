// ---------------------------------------------------------------------------
// TASK §23 — mappers DTO → view model. Funciones PURAS y testeables.
//
// Contrato central: un dato que el backend no envía se representa como `null`
// (o `[]`), nunca como un literal inventado. Quien renderiza decide qué
// mostrar con `null` (regla: "—" o "Sin datos").
// ---------------------------------------------------------------------------

import type {
  AccountDto, DevicesDto, LogEntryDto, OpenApiDocument, OpenApiOperation,
  ProxyDto, PublicationDto, QueueJobDto, StatsDto,
} from './dto';
import type { StatusBadgeKind } from '../components/design/StatusBadge';
import { STAGE_META_FROM_STATUS, type JobBucket, type QueueJobStatus } from '../components/design/_mapping';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Timestamp ISO o epoch (s/ms) → epoch ms, o null si no es parseable. */
export function toEpochMs(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // Heurística: 10 dígitos = segundos, 13 = milisegundos.
    return v < 1e11 ? v * 1000 : v;
  }
  const asNumber = Number(v);
  if (v.trim() !== '' && Number.isFinite(asNumber)) return toEpochMs(asNumber);
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? null : parsed;
}

// --- SYSTEM STATS -----------------------------------------------------------

export interface StatsViewModel {
  videosSubidos: number | null;
  accionesHoy: number | null;
  errores: number | null;
  cpuPercent: number | null;
  ramPercent: number | null;
  activeBots: number | null;
  activeProxies: number | null;
  pandaGridStatus: string | null;
  /** Campos realmente ausentes en la respuesta: la UI no los rellena. */
  missing: string[];
}

export function mapStats(dto: StatsDto | null | undefined): StatsViewModel {
  const d = dto ?? {};
  const pick = (value: number | null | undefined): number | null => (isNum(value) ? value : null);
  const num = (key: keyof StatsDto) => pick(d[key] as number | null | undefined);
  const missing = (key: string, value: number | null) => { if (value === null) missing_keys.push(key); return value; };
  const missing_keys: string[] = [];
  return {
    videosSubidos: missing('videos_subidos', num('videos_subidos')),
    accionesHoy: missing('acciones_hoy', num('acciones_hoy')),
    errores: missing('errores', num('errores')),
    cpuPercent: missing('cpu_percent', num('cpu_percent')),
    ramPercent: missing('ram_percent', num('ram_percent')),
    activeBots: missing('active_bots', num('active_bots')),
    activeProxies: missing('active_proxies', num('active_proxies')),
    pandaGridStatus: str(d.panda_grid_status),
    missing: missing_keys,
  };
}

// --- ACCOUNTS ---------------------------------------------------------------

export type AccountHealth = 'ok' | 'warn' | 'danger' | 'unknown';

export interface AccountViewModel {
  id: string;
  username: string | null;
  statusRaw: string | null;
  statusLabel: string;
  statusKind: StatusBadgeKind;
  deviceSerial: string | null;
  proxyId: string | null;
  createdAtMs: number | null;
  lastActivityMs: number | null;
  platform: string | null;
  niche: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  engagementRate: number | null;
  likesToday: number | null;
  followsToday: number | null;
  commentsToday: number | null;
  botActive: boolean | null;
  warmupDay: number | null;
  /** Sin device_serial la cuenta no es operable: la UI lo marca. */
  hasDevice: boolean;
  hasProxy: boolean;
  health: AccountHealth;
}

const STATUS_META: Record<string, { label: string; kind: StatusBadgeKind; health: AccountHealth }> = {
  active: { label: 'Activa', kind: 'ok', health: 'ok' },
  warmup: { label: 'Calentando', kind: 'warn', health: 'warn' },
  paused: { label: 'Pausada', kind: 'paused', health: 'warn' },
  error: { label: 'Error', kind: 'danger', health: 'danger' },
};

const UNKNOWN_STATUS: { label: string; kind: StatusBadgeKind; health: AccountHealth } = {
  label: 'Desconocido', kind: 'unknown', health: 'unknown',
};

export function mapAccount(dto: AccountDto): AccountViewModel {
  const statusRaw = str(dto.status);
  const meta = (statusRaw && STATUS_META[statusRaw]) || UNKNOWN_STATUS;
  const deviceSerial = str(dto.device_serial);
  const proxyId = str(dto.proxy_id);
  // Indicadores de operación incompletos: la UI los marca, no los inventa.
  const hasDevice = deviceSerial !== null;
  const hasProxy = proxyId !== null;
  // health combina estado declarado y conectividad declarada por el backend.
  let health = meta.health;
  if (statusRaw === 'active' && (!hasDevice || !hasProxy)) health = 'warn';
  return {
    id: dto.id,
    username: str(dto.username),
    statusRaw,
    statusLabel: meta.label,
    statusKind: meta.kind,
    deviceSerial,
    proxyId,
    createdAtMs: toEpochMs(dto.created_at),
    lastActivityMs: toEpochMs(dto.last_activity),
    platform: str(dto.platform),
    niche: str(dto.niche),
    followersCount: isNum(dto.followers_count) ? dto.followers_count : null,
    followingCount: isNum(dto.following_count) ? dto.following_count : null,
    postsCount: isNum(dto.posts_count) ? dto.posts_count : null,
    engagementRate: isNum(dto.engagement_rate) ? dto.engagement_rate : null,
    likesToday: isNum(dto.likes_today) ? dto.likes_today : null,
    followsToday: isNum(dto.follows_today) ? dto.follows_today : null,
    commentsToday: isNum(dto.comments_today) ? dto.comments_today : null,
    botActive: bool(dto.bot_active),
    warmupDay: isNum(dto.warmup_day) ? dto.warmup_day : null,
    hasDevice,
    hasProxy,
    health,
  };
}

export function mapAccounts(dtos: AccountDto[] | null | undefined): AccountViewModel[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.filter((d): d is AccountDto => !!d && typeof d.id === 'string').map(mapAccount);
}

// --- PROXIES ----------------------------------------------------------------

export type ProxyStatus = 'online' | 'offline' | 'checking' | 'unknown';

export interface ProxyViewModel {
  id: string;
  provider: string | null;
  type: string | null;
  host: string | null;
  port: number | null;
  assignedAccount: string | null;
  status: ProxyStatus;
  statusLabel: string;
  statusKind: StatusBadgeKind;
  ip: string | null;
  latencyMs: number | null;
  hasCredentials: boolean;
}

const PROXY_STATUS_META: Record<ProxyStatus, { label: string; kind: StatusBadgeKind }> = {
  online: { label: 'Online', kind: 'ok' },
  offline: { label: 'Offline', kind: 'danger' },
  checking: { label: 'Comprobando', kind: 'warn' },
  unknown: { label: 'Sin estado', kind: 'unknown' },
};

export function mapProxy(dto: ProxyDto): ProxyViewModel {
  const raw = str(dto.status);
  const status: ProxyStatus = raw === 'online' || raw === 'offline' || raw === 'checking' ? raw : 'unknown';
  const user = str(dto.user);
  const pass = str(dto.pass);
  return {
    id: dto.id,
    provider: str(dto.provider),
    type: str(dto.type),
    host: str(dto.host),
    port: isNum(dto.port) ? dto.port : null,
    assignedAccount: str(dto.assigned_account),
    status,
    statusLabel: PROXY_STATUS_META[status].label,
    statusKind: PROXY_STATUS_META[status].kind,
    ip: str(dto.ip),
    latencyMs: isNum(dto.latency_ms) ? dto.latency_ms : null,
    hasCredentials: user !== null && pass !== null,
  };
}

export function mapProxies(dtos: ProxyDto[] | null | undefined): ProxyViewModel[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.filter((d): d is ProxyDto => !!d && typeof d.id === 'string').map(mapProxy);
}

// --- QUEUE ------------------------------------------------------------------

export interface QueueJobViewModel {
  id: string;
  keyword: string | null;
  targetAccount: string | null;
  status: QueueJobStatus | 'unknown';
  statusLabel: string;
  statusKind: StatusBadgeKind;
  bucket: JobBucket | 'unknown';
  bucketLabel: string;
  progressPercent: number;
  createdAtMs: number | null;
  scheduledMs: number | null;
  error: string | null;
  hasVideo: boolean;
}

const UNKNOWN_STAGE = {
  kind: 'unknown' as StatusBadgeKind, label: 'Desconocido', bucket: 'unknown' as const,
  bucketLabel: 'Desconocido', bar: 0, color: 'var(--color-muted-2)',
};

export function mapQueueJob(dto: QueueJobDto): QueueJobViewModel {
  const raw = str(dto.status);
  const stage = raw && raw in STAGE_META_FROM_STATUS
    ? STAGE_META_FROM_STATUS[raw as QueueJobStatus]
    : UNKNOWN_STAGE;
  const progress = isNum(dto.progress) ? Math.max(0, Math.min(100, dto.progress)) : null;
  return {
    id: dto.id,
    keyword: str(dto.keyword),
    targetAccount: str(dto.target_account),
    status: (raw && raw in STAGE_META_FROM_STATUS ? raw : 'unknown') as QueueJobStatus | 'unknown',
    statusLabel: stage.label,
    statusKind: stage.kind,
    bucket: stage.bucket,
    bucketLabel: stage.bucketLabel,
    // Si el backend no envía progress, se usa la barra canónica del estado
    // (no un porcentaje inventado por request).
    progressPercent: progress ?? stage.bar,
    createdAtMs: toEpochMs(dto.created_at),
    scheduledMs: toEpochMs(dto.scheduled_ts),
    error: str(dto.error),
    hasVideo: str(dto.video_path) !== null,
  };
}

export function mapQueue(dtos: QueueJobDto[] | null | undefined): QueueJobViewModel[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.filter((d): d is QueueJobDto => !!d && typeof d.id === 'string').map(mapQueueJob);
}

export interface PipelineSummary {
  bucket: JobBucket | 'unknown';
  label: string;
  count: number;
  kind: StatusBadgeKind;
}

export function summarizePipeline(jobs: QueueJobViewModel[]): PipelineSummary[] {
  const order: (JobBucket | 'unknown')[] = ['queued', 'generating', 'ready', 'publishing', 'completed', 'failed', 'unknown'];
  const labelOf: Record<PipelineSummary['bucket'], string> = {
    queued: 'Queued', generating: 'Generating', ready: 'Ready', publishing: 'Publishing',
    completed: 'Completed', failed: 'Failed', unknown: 'Desconocido',
  };
  return order.map((bucket) => {
    const sample = jobs.find((j) => j.bucket === bucket);
    return {
      bucket,
      label: sample?.bucketLabel ?? labelOf[bucket],
      count: jobs.filter((j) => j.bucket === bucket).length,
      kind: sample?.statusKind ?? 'unknown',
    };
  });
}

// --- ADB DEVICES ------------------------------------------------------------

export interface DeviceViewModel {
  serial: string;
  state: string | null;
  stateLabel: string;
  stateKind: StatusBadgeKind;
  model: string | null;
  isOnline: boolean;
}

export function mapDevices(dto: DevicesDto | null | undefined): DeviceViewModel[] {
  const list = dto?.devices;
  if (!Array.isArray(list)) return [];
  return list
    .filter((d): d is { serial: string; state?: string | null; model?: string | null } =>
      !!d && typeof d.serial === 'string' && d.serial !== '')
    .map((d) => {
      const state = str(d.state);
      const online = state === 'device';
      return {
        serial: d.serial,
        state,
        stateLabel: online ? 'Online' : state ?? 'Sin estado',
        stateKind: (online ? 'ok' : state ? 'danger' : 'unknown') as StatusBadgeKind,
        model: str(d.model),
        isOnline: online,
      };
    });
}

// --- LOGS -------------------------------------------------------------------

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'UNKNOWN';
export type LogViewModel = { id: string; atMs: number | null; level: LogLevel; levelRank: number; module: string | null; message: string };

const LEVEL_RANK: Record<LogLevel, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, UNKNOWN: 4 };

export function mapLog(dto: LogEntryDto, index = 0): LogViewModel {
  const raw = (str(dto.level) ?? '').toUpperCase();
  const level: LogLevel = raw === 'INFO' || raw === 'WARN' || raw === 'ERROR' || raw === 'DEBUG' ? raw : 'UNKNOWN';
  return {
    id: str(dto.id) ?? `${toEpochMs(dto.timestamp) ?? 0}-${index}`,
    atMs: toEpochMs(dto.timestamp),
    level,
    levelRank: LEVEL_RANK[level],
    module: str(dto.module),
    message: str(dto.message) ?? '',
  };
}

export function mapLogs(dtos: LogEntryDto[] | null | undefined): LogViewModel[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.filter(Boolean).map(mapLog);
}

// --- PUBLICATIONS -----------------------------------------------------------

export interface PublicationViewModel {
  id: string;
  title: string | null;
  platform: string | null;
  platformLabel: string;
  status: string | null;
  statusLabel: string;
  statusKind: StatusBadgeKind;
  account: string | null;
  scheduledMs: number | null;
  publishedMs: number | null;
  /** Solo un published_at REAL habilita el contador "publicadas hoy". */
  hasPublishedAt: boolean;
}

const PUBLICATION_STATUS_KIND: Record<string, StatusBadgeKind> = {
  published: 'ok', approved: 'ok', ready_for_publish: 'warn', draft: 'paused',
  scheduled: 'warn', failed: 'danger', rejected: 'danger',
};

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', both: 'IG + TikTok' };

export function mapPublication(dto: PublicationDto): PublicationViewModel {
  const platform = str(dto.platform);
  const status = str(dto.status);
  return {
    id: dto.id,
    title: str(dto.title),
    platform,
    platformLabel: platform ? (PLATFORM_LABEL[platform] ?? platform) : 'Sin plataforma',
    status,
    statusLabel: status ?? 'Sin estado',
    statusKind: (status ? PUBLICATION_STATUS_KIND[status] : undefined) ?? 'unknown',
    account: str(dto.target_account_username) ?? str(dto.target_account_id),
    scheduledMs: toEpochMs(dto.scheduled_time),
    publishedMs: toEpochMs(dto.published_at),
    hasPublishedAt: toEpochMs(dto.published_at) !== null,
  };
}

export function mapPublications(dtos: PublicationDto[] | null | undefined): PublicationViewModel[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.filter((d): d is PublicationDto => !!d && typeof d.id === 'string').map(mapPublication);
}

/** Publicaciones AGENDADAS dentro de la ventana; usa scheduled_time real. */
export function upcomingWithin(
  pubs: PublicationViewModel[],
  nowMs: number,
  windowMs: number,
): PublicationViewModel[] {
  return pubs
    .filter((p) => p.scheduledMs !== null && p.scheduledMs >= nowMs && p.scheduledMs <= nowMs + windowMs)
    .sort((a, b) => (a.scheduledMs ?? 0) - (b.scheduledMs ?? 0));
}

/** Publicaciones REALMENTE publicadas hoy. Sin published_at no se cuenta. */
export function publishedOn(
  pubs: PublicationViewModel[],
  dayStartMs: number,
  dayEndMs: number,
): PublicationViewModel[] {
  return pubs.filter(
    (p) => p.publishedMs !== null && p.publishedMs >= dayStartMs && p.publishedMs < dayEndMs,
  );
}

// --- OPENAPI (TASK §16) -----------------------------------------------------

export interface ApiOperationViewModel {
  key: string;
  method: string;
  methodKind: 'read' | 'write' | 'destroy';
  path: string;
  pathTemplate: string;
  operationId: string;
  summary: string;
  tags: string[];
  roleRequired: string | null;
  needsCsrf: boolean;
  needsSession: boolean;
  rateLimited: boolean;
  validated: boolean;
  pathParams: string[];
  /** body de ejemplo derivado del JSON Schema real (valores placeholder). */
  sampleBody: string | null;
}

/** Construye un body de ejemplo desde el JSON Schema real del endpoint. */
export function sampleBodyFromSchema(schema: Record<string, unknown> | undefined): string | null {
  if (!schema || typeof schema !== 'object') return null;
  const props = schema.properties as Record<string, { type?: string; enum?: unknown[] }> | undefined;
  if (!props || Object.keys(props).length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(props)) {
    if (Array.isArray(def.enum) && def.enum.length > 0) { out[key] = def.enum[0]; continue; }
    switch (def.type) {
      case 'string': out[key] = `<${key}>`; break;
      case 'number':
      case 'integer': out[key] = 0; break;
      case 'boolean': out[key] = false; break;
      default: out[key] = null; break;
    }
  }
  return JSON.stringify(out, null, 2);
}

export function flattenOpenApi(doc: OpenApiDocument | null | undefined): ApiOperationViewModel[] {
  const paths = doc?.paths;
  if (!paths || typeof paths !== 'object') return [];
  const out: ApiOperationViewModel[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== 'object') continue;
      const upper = method.toUpperCase();
      const needsCsrf = op.security?.some((s) => 'csrfHeader' in s) ?? false;
      const needsSession = op.security?.some((s) => 'sessionCookie' in s) ?? false;
      const bodySchema = op.requestBody?.content?.['application/json']?.schema;
      out.push({
        key: `${upper} ${path}`,
        method: upper,
        methodKind: upper === 'GET' || upper === 'HEAD' ? 'read' : upper === 'DELETE' ? 'destroy' : 'write',
        path,
        pathTemplate: path,
        operationId: op.operationId ?? `${method}${path}`,
        summary: op.summary ?? path,
        tags: Array.isArray(op.tags) ? op.tags : [],
        roleRequired: op['x-panel-role'] ?? null,
        needsCsrf,
        needsSession,
        rateLimited: Boolean(op.responses?.['429']),
        validated: Boolean(op['x-panel-validated']),
        pathParams: (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name),
        sampleBody: sampleBodyFromSchema(bodySchema),
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** cURL real: usa la cookie de sesión, no un token inventado. */
export function buildCurl(op: ApiOperationViewModel, baseUrl: string, pathValues: Record<string, string>, body: string | null): string {
  const concrete = op.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const value = pathValues[name];
    // Sin valor: placeholder legible (codificarlo daría %3Cid%3E).
    return value === undefined || value === '' ? `<${name}>` : encodeURIComponent(value);
  });
  const parts = [`curl -i -X ${op.method} ${baseUrl}${concrete}`];
  if (op.needsCsrf) parts.push(`-H "X-CSRF-Token: $CSRF_TOKEN"`);
  if (body) {
    parts.push(`-H "Content-Type: application/json"`);
    parts.push(`-d '${body.replace(/\n\s*/g, "").replace(/'/g, "'\\''")}'`);
  }
  parts.push(op.needsSession ? `# requiere cookie de sesión: -b cookies.txt` : `# endpoint público`);
  return parts.join(" \\\n  ");
}
