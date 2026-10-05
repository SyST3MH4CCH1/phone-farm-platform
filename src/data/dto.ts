// ---------------------------------------------------------------------------
// TASK §23 — Data layer: API DTO → mapper/view model → UI component.
//
// Este archivo NO contiene transformaciones de negocio: solo tipa lo que el
// cable devuelve (snake_case, campos opcionales, valores que el backend puede
// omitir). Los mappers viven en ./mappers.ts y son funciones puras testeables.
//
// Regla: si un campo no viene, es `undefined`/`null` — NUNCA un valor inventado.
// El view model expone `null` y la UI muestra "Sin datos" / "—".
// ---------------------------------------------------------------------------

/** Cronograma/publicación. El backend expone `published_at` en drafts. */
export interface PublicationDto {
  id: string;
  job_id?: string | null;
  title?: string | null;
  platform?: string | null;
  status?: string | null;
  scheduled_time?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  target_account_id?: string | null;
  target_account_username?: string | null;
  video_url?: string | null;
}

export interface StatsDto {
  videos_subidos?: number | null;
  acciones_hoy?: number | null;
  errores?: number | null;
  cpu_percent?: number | null;
  ram_percent?: number | null;
  active_bots?: number | null;
  active_proxies?: number | null;
  panda_grid_status?: string | null;
}

export interface AccountDto {
  id: string;
  username?: string | null;
  status?: string | null;
  device_serial?: string | null;
  proxy_id?: string | null;
  created_at?: string | null;
  last_activity?: string | null;
  platform?: string | null;
  niche?: string | null;
  followers_count?: number | null;
  following_count?: number | null;
  posts_count?: number | null;
  engagement_rate?: number | null;
  likes_today?: number | null;
  follows_today?: number | null;
  comments_today?: number | null;
  bot_active?: boolean | null;
  warmup_day?: number | null;
  session_file?: string | null;
  password?: string | null;
}

export interface ProxyDto {
  id: string;
  provider?: string | null;
  type?: string | null;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  pass?: string | null;
  assigned_account?: string | null;
  status?: string | null;
  ip?: string | null;
  latency_ms?: number | null;
}

export interface QueueJobDto {
  id: string;
  keyword?: string | null;
  target_account?: string | null;
  status?: string | null;
  version?: number | null;
  video_path?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  progress?: number | null;
  media_id?: string | null;
  script?: string | null;
  caption?: string | null;
  error?: string | null;
  scheduled_ts?: number | string | null;
}

export interface DevicesDto {
  devices?: { serial?: string | null; state?: string | null; model?: string | null }[] | null;
}

export interface LogEntryDto {
  id?: string | null;
  timestamp?: string | null;
  level?: string | null;
  module?: string | null;
  message?: string | null;
}

/** Contrato OpenAPI real servido por GET /api/openapi.json (TASK §16). */
export interface OpenApiOperation {
  operationId: string;
  summary: string;
  tags: string[];
  parameters?: { name: string; in: string; required: boolean }[];
  requestBody?: { required: boolean; content: Record<string, { schema: Record<string, unknown> }> };
  security: Record<string, string[]>[];
  responses: Record<string, { description: string }>;
  "x-panel-role": string | null;
  "x-panel-validated": boolean;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
}
