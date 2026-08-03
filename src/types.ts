export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  email: string;
  avatar_url?: string;
  token: string;
}

export interface Account {
  id: string;
  username: string;
  password?: string;
  status: 'active' | 'warmup' | 'paused' | 'error';
  device_serial: string;
  proxy_id: string;
  session_file: string;
  warmup_day: number;
  created_at: string;
  likes_today?: number;
  follows_today?: number;
  comments_today?: number;
  bot_active?: boolean;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  engagement_rate?: number;
  platform?: 'instagram' | 'tiktok' | 'both';
  last_activity?: string;
  niche?: string;
}

export interface DraftPost {
  id: string;
  job_id: string;
  title: string;
  keyword: string;
  target_account_id: string;
  target_account_username: string;
  platform: 'instagram' | 'tiktok' | 'both';
  video_url: string;
  script: string;
  caption: string;
  hashtags: string[];
  status: 'draft' | 'approved' | 'published';
  created_at: string;
  aspect_ratio: '9:16' | '16:9' | '1:1';
  voice_tts: string;
  scheduled_time?: string;
}

export interface ProxyItem {
  id: string;
  provider: string;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  user: string;
  pass: string;
  assigned_account: string;
  status: 'online' | 'offline' | 'checking';
  ip?: string;
  latency_ms?: number;
}

export interface QueueJob {
  id: string;
  keyword: string;
  target_account: string;
  status: 'pending' | 'generating' | 'published' | 'failed' | 'awaiting_manual_upload';
  video_path: string | null;
  created_at: string;
  progress?: number;
  media_id?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  module: string;
  message: string;
}

export interface SystemStats {
  videos_subidos: number;
  acciones_hoy: number;
  errores: number;
  cpu_percent: number;
  ram_percent: number;
  active_bots: number;
  active_proxies: number;
  panda_grid_status: 'Connected' | 'Scanning' | 'Disconnected';
}

export interface CodeFile {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export interface MoneyPrinterConfig {
  repo_url: string;
  bind_address: string;
  llm_provider: 'gemini' | 'openai' | 'claude' | 'deepseek' | 'ollama';
  llm_model: string;
  video_aspect: '9:16' | '16:9' | '1:1';
  video_concat_mode: 'sequential' | 'random';
  audio_tts_engine: 'edge_tts' | 'openai_tts' | 'elevenlabs';
  voice_name: string;
  voice_volume: number;
  bgm_volume: number;
  subtitle_enabled: boolean;
  subtitle_font: string;
  subtitle_color: string;
  subtitle_size: number;
  pexels_api_key: string;
  pixabay_api_key?: string;
  auto_upload_to_adb: boolean;
  status: 'online' | 'offline' | 'error';
}
