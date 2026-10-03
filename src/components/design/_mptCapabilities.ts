// TASK §13 — MPT adapter capability map.
// Clasifica cada capacidad del upstream MoneyPrinterTurbo como
// NOW (integrada en Control Hub), LATER (pendiente de gate) o
// REJECT (fuera de alcance). Fuente: MONEYPRINTERTURBO_UPSTREAM_INSPECTION.md.

export type MptDecision = 'NOW' | 'LATER' | 'REJECT';

export interface MptCapability {
  key: string;
  label: string;
  decision: MptDecision;
  /** Versión del upstream donde aparece. */
  since: '1.3.7' | '1.3.8';
  note: string;
}

export const MPT_PIN_SHA = 'cf5a3aedad1741d012152d355aa909d224fc4557';
export const MPT_PIN_VERSION = '1.3.7';
export const MPT_LICENSE = 'MIT';

export const MPT_CAPABILITIES: readonly MptCapability[] = [
  // --- v1.3.7 (pin local) ---
  { key: 'script', label: 'Guion vía LLM', decision: 'NOW', since: '1.3.7', note: 'Flask generator.py orquesta; el panel nunca llama MPT directo.' },
  { key: 'material_pexels', label: 'Materiales Pexels', decision: 'NOW', since: '1.3.7', note: 'Requiere PEXELS_API_KEY en el backend (nunca en el bundle).' },
  { key: 'tts_edge', label: 'TTS Edge (gratis)', decision: 'NOW', since: '1.3.7', note: 'Default. Sin coste.' },
  { key: 'tts_openai', label: 'TTS OpenAI', decision: 'NOW', since: '1.3.7', note: 'Requiere OPENAI_API_KEY server-side.' },
  { key: 'tts_elevenlabs', label: 'TTS ElevenLabs', decision: 'NOW', since: '1.3.7', note: 'Requiere ELEVENLABS_API_KEY server-side.' },
  { key: 'subtitles_ffmpeg', label: 'Subtítulos SRT/ASS', decision: 'NOW', since: '1.3.7', note: 'Font/color/size configurables desde el panel.' },
  { key: 'bgm_local', label: 'BGM local', decision: 'NOW', since: '1.3.7', note: 'MPT elige aleatorio de su librería; volumen configurable.' },
  { key: 'format_9_16', label: 'Formato 9:16 / 16:9 / 1:1', decision: 'NOW', since: '1.3.7', note: 'Selector en la sección 7.' },
  { key: 'concat_mode', label: 'Concatenación random/sequential', decision: 'NOW', since: '1.3.7', note: 'Selector en la sección 7.' },
  { key: 'api_v1', label: 'API FastAPI /api/v1/*', decision: 'NOW', since: '1.3.7', note: 'Base del adapter Flask.' },

  // --- v1.3.8 (upstream avanzado, NO pinneado) ---
  { key: 'cli_batch', label: 'CLI batch (--batch-file)', decision: 'LATER', since: '1.3.8', note: 'Exponer POST /api/moneyprinter/batch tras Gate E.' },
  { key: 'video_projects', label: 'Video projects (revision-aware)', decision: 'REJECT', since: '1.3.8', note: 'Complejidad sin ganancia V1; ya hay orquestador Flask.' },
  { key: 'ai_agent_skill', label: 'AI Agent Skill', decision: 'REJECT', since: '1.3.8', note: 'Control Hub ya tiene su propio agente/orquestador.' },
  { key: 'llm_multi_provider', label: '+LLM providers (Claude, Gemini, DeepSeek, Qwen, Ark, Grok, MiMo)', decision: 'LATER', since: '1.3.8', note: 'Requiere ampliar mptSettingsSchema + tests + UI.' },
  { key: 'material_ai_video', label: '+AI video sources (Seedance, MiniMax H3, WaveSpeed, MuAPI…)', decision: 'LATER', since: '1.3.8', note: 'Capability Gate separado: tiene coste GPU-cloud.' },
  { key: 'tts_multi_provider', label: '+TTS (Azure V2, SiliconFlow, Kokoro, Chatterbox, VoxCPM…)', decision: 'LATER', since: '1.3.8', note: 'Ampliar audio_tts_engine enum.' },
  { key: 'subtitle_display_mode', label: 'Subtitle display mode (sentence/word_by_word)', decision: 'LATER', since: '1.3.8', note: 'Nuevo campo en schema.' },
  { key: 'subtitle_animation', label: 'Subtitle animation (pop_spring)', decision: 'LATER', since: '1.3.8', note: 'Nuevo campo en schema.' },
  { key: 'video_fit_mode', label: 'video_fit_mode (cover/contain)', decision: 'LATER', since: '1.3.8', note: 'Sección 8 (Avanzado).' },
  { key: 'video_transition_mode', label: 'video_transition_mode (8 modos)', decision: 'LATER', since: '1.3.8', note: 'Sección 8 (Avanzado).' },
  { key: 'voice_rate', label: 'voice_rate (speech rate)', decision: 'LATER', since: '1.3.8', note: 'Sección 4 (Voz).' },
  { key: 'match_materials_to_script', label: 'match_materials_to_script', decision: 'LATER', since: '1.3.8', note: 'Sección 3 (Material).' },
  { key: 'paragraph_number', label: 'paragraph_number (1-10)', decision: 'LATER', since: '1.3.8', note: 'Sección 2 (Guion).' },
  { key: 'custom_system_prompt', label: 'custom_system_prompt', decision: 'LATER', since: '1.3.8', note: 'XSS risk: siempre como texto plano, nunca innerHTML.' },
  { key: 'cross_post_fields', label: 'cross_post_state/results/error', decision: 'NOW', since: '1.3.8', note: 'Wire en el adapter para observabilidad. Publishing sigue OFF.' },
  { key: 'failed_stage', label: 'failed_stage', decision: 'NOW', since: '1.3.8', note: 'Reflejar en QueueJob.error con prefijo stage=.' },
  { key: 'task_pagination', label: 'Paginación de tasks (page/page_size)', decision: 'LATER', since: '1.3.8', note: 'Cuando la tabla de cola supere ~200 jobs.' },
  { key: 'social_metadata', label: 'social-metadata (title/caption/hashtags)', decision: 'LATER', since: '1.3.8', note: 'Proxy POST /api/moneyprinter/social-metadata.' },
] as const;

export function capabilitiesByDecision(d: MptDecision): MptCapability[] {
  return MPT_CAPABILITIES.filter((c) => c.decision === d);
}

export function crossPostEnabled(): boolean {
  // TASK §30: el cross-post de MPT NUNCA se activa por defecto.
  return false;
}
