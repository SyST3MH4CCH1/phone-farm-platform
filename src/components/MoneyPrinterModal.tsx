import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { MoneyPrinterConfig, Account, StackInfo } from '../types';
import { apiFetch } from '../api';
import {
  Sparkles, Settings, Subtitles, Music, Film, Type, Mic, Image as ImageIcon, Wrench,
} from 'lucide-react';
import { CollapsibleSection, HealthIndicator, StatusBadge, capabilitiesByDecision } from './design';

interface MoneyPrinterModalProps {
  accounts: Account[];
  initialAccount?: Account;
  /** Stack info real del panel — TASK §13.5 "zona derecha con estado real MPT". */
  stack?: StackInfo | null;
  onClose: () => void;
  onRefreshData: () => void;
}

/**
 * MoneyPrinterModal — TASK §13.5.
 *
 * NO es una copia de la WebUI de MPT (TASK §13.1: MPT no es el dominio
 * central). Es un wizard propio con 8 secciones plegables, y a la derecha
 * el estado REAL del servicio (nunca inventado).
 *
 * Secciones (TASK §13.5):
 *   1. Idea / keyword
 *   2. Guion y LLM
 *   3. Material / clips
 *   4. Voz / TTS
 *   5. Subtítulos
 *   6. BGM
 *   7. Formato y salida
 *   8. Avanzado
 */
export const MoneyPrinterModal: React.FC<MoneyPrinterModalProps> = ({
  accounts, initialAccount, stack, onClose, onRefreshData,
}) => {
  const [config, setConfig] = useState<MoneyPrinterConfig>({
    repo_url: 'https://github.com/harry0703/MoneyPrinterTurbo',
    bind_address: '127.0.0.1:8501',
    llm_provider: 'gemini',
    llm_model: 'gemini-2.5-flash',
    video_aspect: '9:16',
    video_concat_mode: 'sequential',
    audio_tts_engine: 'edge_tts',
    voice_name: 'es-ES-AlvaroNeural',
    voice_volume: 1.0,
    bgm_volume: 0.2,
    subtitle_enabled: true,
    subtitle_font: 'STHeiti',
    subtitle_color: '#FFFFFF',
    subtitle_size: 28,
    pexels_api_key: '',
    auto_upload_to_adb: true,
    status: 'online',
  });

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  const [keyword, setKeyword] = useState('');
  const [targetAccount, setTargetAccount] = useState(initialAccount?.id || accounts[0]?.id || '');
  const [customPrompt, setCustomPrompt] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingPexels, setTestingPexels] = useState(false);
  const [pexelsResult, setPexelsResult] = useState<{ valid: boolean; message: string } | null>(null);

  const [genResult, setGenResult] = useState<{ success: boolean; job: any; error?: string } | null>(null);
  const setGenError = (message: string) => setGenResult({ success: false, job: null, error: message });

  useEffect(() => {
    apiFetch('/api/moneyprinter/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setConfig(data); })
      .catch(() => {});
  }, []);

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/moneyprinter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        onRefreshData();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(`No se pudo guardar la configuración: ${data?.error || res.status}`);
      }
    } catch (err) {
      window.alert(`No se pudo guardar la configuración: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPexels = async () => {
    setTestingPexels(true);
    setPexelsResult(null);
    try {
      const res = await apiFetch('/api/moneyprinter/test-pexels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pexels_api_key: config.pexels_api_key }),
      });
      if (res.ok) {
        const data = await res.json();
        setPexelsResult({
          valid: true,
          message: data.message || `Conexión Pexels verificada (${data.total_results || 0}+ clips disponibles)`,
        });
      } else {
        setPexelsResult({ valid: false, message: 'API Key de Pexels inválida o sin respuesta.' });
      }
    } catch (err) {
      setPexelsResult({
        valid: false,
        message: `No se pudo verificar Pexels (red): ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTestingPexels(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGenResult(null);
    try {
      const res = await apiFetch('/api/moneyprinter/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          target_account: targetAccount,
          custom_prompt: customPrompt,
          video_aspect: config.video_aspect,
          voice_name: config.voice_name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGenResult(data);
        onRefreshData();
      } else {
        const data = await res.json().catch(() => ({}));
        setGenError(data?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setGenError(`Fallo de red: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const mptOnline = stack?.mpt_online ?? null;
  const flaskOnline = stack?.flask_online ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        className="modal-shell w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="modal-header px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
              MoneyPrinterTurbo Engine
            </h3>
            <p className="text-[11px] mt-0.5 font-sans" style={{ color: 'var(--color-muted)' }}>
              Generador de vídeo con IA vía adapter. MPT corre como servicio aislado
              (loopback) — el panel nunca habla con él directamente.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn-close">✕</button>
        </div>

        {/* 2 columnas: izquierda = 8 secciones plegables, derecha = estado real */}
        <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}>
          <form onSubmit={handleGenerateVideo} className="p-5 overflow-y-auto space-y-3 text-xs">
            {/* 1 — Idea / keyword */}
            <CollapsibleSection title="1. Idea / Keyword" icon={<Sparkles size={14} />} defaultOpen badge={keyword || '—'}>
              <div>
                <label htmlFor="gen-keyword" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Keyword / Nicho principal
                </label>
                <input
                  id="gen-keyword" type="text" required value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="ej. rutina de fitness en casa"
                  className="input w-full px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="gen-account" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Cuenta destino
                </label>
                <select
                  id="gen-account" value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="input w-full px-3 py-2"
                >
                  {accounts.length === 0 && <option value="">Sin cuentas</option>}
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      @{acc.username} ({acc.device_serial})
                    </option>
                  ))}
                </select>
              </div>
            </CollapsibleSection>

            {/* 2 — Guion y LLM */}
            <CollapsibleSection title="2. Guion y LLM" icon={<Type size={14} />} badge={config.llm_provider}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mpt-llm" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Proveedor LLM
                  </label>
                  <select
                    id="mpt-llm" value={config.llm_provider}
                    onChange={(e) => setConfig({ ...config, llm_provider: e.target.value as any })}
                    className="input w-full px-3 py-2"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Anthropic Claude</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="ollama">Ollama (local)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="mpt-llm-model" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Modelo
                  </label>
                  <input
                    id="mpt-llm-model" type="text" value={config.llm_model}
                    onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                    className="input w-full px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="mpt-prompt" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Instrucción opcional para el LLM
                </label>
                <textarea
                  id="mpt-prompt" rows={2} value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Tono, enfoque, extensión…"
                  className="input w-full px-3 py-1.5 text-[11px] resize-none"
                />
              </div>
            </CollapsibleSection>

            {/* 3 — Material / clips */}
            <CollapsibleSection title="3. Material / Clips" icon={<ImageIcon size={14} />} hint="Pexels (stock)">
              <div>
                <label htmlFor="mpt-pexels" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Pexels API Key
                </label>
                <div className="flex gap-2">
                  <input
                    id="mpt-pexels" type="password" value={config.pexels_api_key}
                    onChange={(e) => setConfig({ ...config, pexels_api_key: e.target.value })}
                    className="input flex-1 px-3 py-1.5"
                  />
                  <button type="button" onClick={handleTestPexels} disabled={testingPexels} className="btn-secondary px-3 py-1.5">
                    {testingPexels ? 'Verificando…' : 'Probar Key'}
                  </button>
                </div>
              </div>
              {pexelsResult && (
                <div
                  className="p-2.5 border text-[11px]"
                  style={{
                    borderColor: pexelsResult.valid ? 'var(--color-ok)' : 'var(--color-danger)',
                    background: pexelsResult.valid ? 'rgba(34,197,94,0.10)' : 'rgba(255,59,92,0.10)',
                    color: pexelsResult.valid ? 'var(--color-ok)' : 'var(--color-danger)',
                    borderRadius: '6px',
                  }}
                  role="status"
                >
                  {pexelsResult.message}
                </div>
              )}
            </CollapsibleSection>

            {/* 4 — Voz / TTS */}
            <CollapsibleSection title="4. Voz / TTS" icon={<Mic size={14} />} badge={config.voice_name}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mpt-voice" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Voz
                  </label>
                  <select
                    id="mpt-voice" value={config.voice_name}
                    onChange={(e) => setConfig({ ...config, voice_name: e.target.value })}
                    className="input w-full px-3 py-2"
                  >
                    <option value="es-ES-AlvaroNeural">Álvaro (es-ES)</option>
                    <option value="es-MX-DaliaNeural">Dalia (es-MX)</option>
                    <option value="en-US-AnaNeural">Ana (en-US)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="mpt-tts" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Motor TTS
                  </label>
                  <select
                    id="mpt-tts" value={config.audio_tts_engine}
                    onChange={(e) => setConfig({ ...config, audio_tts_engine: e.target.value as any })}
                    className="input w-full px-3 py-2"
                  >
                    <option value="edge_tts">Edge TTS (gratis)</option>
                    <option value="openai_tts">OpenAI TTS</option>
                    <option value="elevenlabs">ElevenLabs</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="mpt-voice-vol" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Volumen de voz ({Math.round(config.voice_volume * 100)}%)
                </label>
                <input
                  id="mpt-voice-vol" type="range" min="0" max="1" step="0.05"
                  value={config.voice_volume}
                  onChange={(e) => setConfig({ ...config, voice_volume: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </CollapsibleSection>

            {/* 5 — Subtítulos */}
            <CollapsibleSection title="5. Subtítulos" icon={<Subtitles size={14} />} defaultOpen={false} badge={config.subtitle_enabled ? 'on' : 'off'}>
              <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                <input
                  type="checkbox" checked={config.subtitle_enabled}
                  onChange={(e) => setConfig({ ...config, subtitle_enabled: e.target.checked })}
                />
                Activar subtítulos (SRT/ASS vía FFmpeg)
              </label>
              {config.subtitle_enabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="mpt-sub-font" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                      Tipografía
                    </label>
                    <input
                      id="mpt-sub-font" type="text" value={config.subtitle_font}
                      onChange={(e) => setConfig({ ...config, subtitle_font: e.target.value })}
                      className="input w-full px-3 py-1.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="mpt-sub-color" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                      Color
                    </label>
                    <input
                      id="mpt-sub-color" type="color" value={config.subtitle_color}
                      onChange={(e) => setConfig({ ...config, subtitle_color: e.target.value })}
                      className="w-full h-8 px-1 py-1 cursor-pointer"
                      style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="mpt-sub-size" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                      Tamaño
                    </label>
                    <input
                      id="mpt-sub-size" type="number" value={config.subtitle_size}
                      onChange={(e) => setConfig({ ...config, subtitle_size: Number(e.target.value) })}
                      className="input w-full px-3 py-1.5"
                    />
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* 6 — BGM */}
            <CollapsibleSection title="6. Música de Fondo" icon={<Music size={14} />} badge={`${Math.round(config.bgm_volume * 100)}%`}>
              <div>
                <label htmlFor="mpt-bgm-vol" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Volumen BGM ({Math.round(config.bgm_volume * 100)}%)
                </label>
                <input
                  id="mpt-bgm-vol" type="range" min="0" max="1" step="0.05"
                  value={config.bgm_volume}
                  onChange={(e) => setConfig({ ...config, bgm_volume: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              <p className="text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
                MPT elige BGM aleatorio de su librería. Fuentes adicionales
                (Sonilo, Suno, etc.) son <strong>LATER</strong> — ver
                <code className="mx-1">docs/integrations/MONEYPRINTERTURBO_UPSTREAM_INSPECTION.md</code>.
              </p>
            </CollapsibleSection>

            {/* 7 — Formato y salida */}
            <CollapsibleSection title="7. Formato y Salida" icon={<Film size={14} />} badge={config.video_aspect}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mpt-aspect" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Aspect ratio
                  </label>
                  <select
                    id="mpt-aspect" value={config.video_aspect}
                    onChange={(e) => setConfig({ ...config, video_aspect: e.target.value as any })}
                    className="input w-full px-3 py-2"
                  >
                    <option value="9:16">9:16 (Reels/TikTok/Shorts)</option>
                    <option value="16:9">16:9 (YouTube)</option>
                    <option value="1:1">1:1 (Cuadrado)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="mpt-concat" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                    Modo de concatenación
                  </label>
                  <select
                    id="mpt-concat" value={config.video_concat_mode}
                    onChange={(e) => setConfig({ ...config, video_concat_mode: e.target.value as any })}
                    className="input w-full px-3 py-2"
                  >
                    <option value="random">Aleatorio</option>
                    <option value="sequential">Secuencial</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                <input
                  type="checkbox" checked={config.auto_upload_to_adb}
                  onChange={(e) => setConfig({ ...config, auto_upload_to_adb: e.target.checked })}
                />
                Inyectar automáticamente en la cola ADB
              </label>
            </CollapsibleSection>

            {/* 8 — Avanzado */}
            <CollapsibleSection title="8. Avanzado" icon={<Wrench size={14} />}>
              <div>
                <label htmlFor="mpt-bind" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Bind address (loopback)
                </label>
                <input
                  id="mpt-bind" type="text" value={config.bind_address}
                  onChange={(e) => setConfig({ ...config, bind_address: e.target.value })}
                  placeholder="127.0.0.1:8501"
                  className="input w-full px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="mpt-repo" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Upstream repo
                </label>
                <input
                  id="mpt-repo" type="text" value={config.repo_url} readOnly
                  className="input w-full px-3 py-2 opacity-60"
                />
              </div>
              <p className="text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
                Provider LLM, TTS, material y cross-post son <strong>NOW</strong>.
                Filtros de transición, <code>video_fit_mode</code>,{' '}
                <code>video_transition_mode</code> y <code>voice_rate</code> son
                <strong> LATER</strong> (MPT v1.3.8). Cross-post está{' '}
                <strong>OFF</strong> por feature flag.
              </p>
            </CollapsibleSection>

            {/* Acciones */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-[11px] flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: mptOnline ? 'var(--color-ok)' : 'var(--color-danger)' }} />
                <span>Motor: <strong>{config.voice_name}</strong> + Pexels</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button" onClick={handleSaveConfig} disabled={saving}
                  className="btn-secondary px-4 py-2"
                >
                  {saving ? 'Guardando…' : 'Guardar Config'}
                </button>
                <button
                  type="submit" disabled={loading || !keyword || !targetAccount}
                  className="btn-brand px-5 py-2 disabled:opacity-50"
                >
                  {loading ? 'Ejecutando…' : 'Generar & Encolar'}
                </button>
              </div>
            </div>

            {genResult && genResult.error && (
              <div
                className="p-4 border text-[11px]"
                style={{ borderColor: 'var(--color-danger)', background: 'rgba(255,59,92,0.10)', color: 'var(--color-danger)', borderRadius: '6px' }}
                role="alert"
              >
                <div className="font-bold">⚠ Fallo al generar el vídeo</div>
                <div className="mt-1" style={{ color: 'var(--color-text)' }}>{genResult.error}</div>
              </div>
            )}
            {genResult && !genResult.error && (
              <div
                className="p-4 border text-[11px] space-y-2"
                style={{ borderColor: 'var(--color-ok)', background: 'rgba(34,197,94,0.10)', color: 'var(--color-ok)', borderRadius: '6px' }}
                role="status"
              >
                <div className="font-bold">✓ Vídeo procesado y encolado</div>
                <div style={{ color: 'var(--color-text)' }} className="font-mono">
                  <div>Job ID: <strong>{genResult.job?.id ?? '—'}</strong></div>
                  <div>Artefacto: <strong>{genResult.job?.video_path ?? '—'}</strong></div>
                  <div>Cuenta: <strong>@{accounts.find((a) => a.id === genResult.job?.target_account)?.username ?? '—'}</strong></div>
                </div>
              </div>
            )}
          </form>

          {/* Panel derecho: estado REAL (TASK §13.5) */}
          <aside
            className="overflow-y-auto p-4 space-y-4 text-[11px]"
            style={{ background: 'var(--color-surface-2)', borderLeft: '1px solid var(--color-line)' }}
            aria-label="Estado del servicio MoneyPrinterTurbo"
          >
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Estado del servicio
              </h4>
              <HealthIndicator service="MoneyPrinterTurbo" online={mptOnline} />
              <HealthIndicator service="Flask API" online={flaskOnline} />
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Pin upstream
              </h4>
              <dl className="space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--color-muted-2)' }}>Versión</dt>
                  <dd>{stack?.mpt_pinned_version ?? '—'}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--color-muted-2)' }}>SHA</dt>
                  <dd className="break-all" title={stack?.mpt_pinned_sha ?? undefined}>
                    {stack?.mpt_pinned_sha?.slice(0, 12) ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Modo runtime
              </h4>
              {stack?.mode ? (
                <StatusBadge kind={stack.mode === 'docker' ? 'leased' : 'neutral'} label={stack.mode} dot />
              ) : (
                <span style={{ color: 'var(--color-muted-2)' }}>—</span>
              )}
            </div>

            {stack?.containers && stack.containers.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                  Contenedores
                </h4>
                <ul className="space-y-1 font-mono text-[10px]">
                  {stack.containers.map((c) => (
                    <li key={c.name} className="flex items-center gap-1.5">
                      <span aria-hidden="true" style={{ color: 'var(--color-ok)' }}>●</span>
                      <span className="truncate">{c.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Capacidad
              </h4>
              <ul className="space-y-1 text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
                <li>Script: {config.llm_provider}</li>
                <li>TTS: {config.audio_tts_engine}</li>
                <li>Material: Pexels</li>
                <li>Cross-post: OFF (flag)</li>
                <li>Coste USD: — (sin pricing table)</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Cobertura upstream
              </h4>
              <ul className="space-y-0.5 font-mono text-[10px]">
                <li style={{ color: 'var(--color-ok)' }}>NOW · {capabilitiesByDecision('NOW').length}</li>
                <li style={{ color: 'var(--color-warn)' }}>LATER · {capabilitiesByDecision('LATER').length}</li>
                <li style={{ color: 'var(--color-muted-2)' }}>REJECT · {capabilitiesByDecision('REJECT').length}</li>
              </ul>
              <p className="mt-2 text-[9px]" style={{ color: 'var(--color-muted-2)' }}>
                v1.3.7 pinneado; v1.3.8 evaluada sin bumpear.
                Ver <code>docs/integrations/MONEYPRINTERTURBO_UPSTREAM_INSPECTION.md</code>.
              </p>
            </div>
          </aside>
        </div>
      </motion.div>
    </div>
  );
};
