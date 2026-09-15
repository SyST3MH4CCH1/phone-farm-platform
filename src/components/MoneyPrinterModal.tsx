import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { MoneyPrinterConfig, Account } from '../types';
import { apiFetch } from '../api';
import { Sparkles, Settings, Subtitles } from 'lucide-react';

interface MoneyPrinterModalProps {
  accounts: Account[];
  initialAccount?: Account;
  onClose: () => void;
  onRefreshData: () => void;
}

export const MoneyPrinterModal: React.FC<MoneyPrinterModalProps> = ({ accounts, initialAccount, onClose, onRefreshData }) => {
  const [config, setConfig] = useState<MoneyPrinterConfig>({
    repo_url: "https://github.com/harry0703/MoneyPrinterTurbo",
    bind_address: "127.0.0.1:8501",
    llm_provider: "gemini",
    llm_model: "gemini-2.5-flash",
    video_aspect: "9:16",
    video_concat_mode: "sequential",
    audio_tts_engine: "edge_tts",
    voice_name: "es-ES-AlvaroNeural",
    voice_volume: 1.0,
    bgm_volume: 0.2,
    subtitle_enabled: true,
    subtitle_font: "STHeiti",
    subtitle_color: "#FFFFFF",
    subtitle_size: 28,
    pexels_api_key: "",
    auto_upload_to_adb: true,
    status: "online"
  });

  const [activeTab, setActiveTab] = useState<'generator' | 'engine' | 'subtitles'>('generator');
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
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setConfig(data);
      })
      .catch(() => {});
  }, []);

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/moneyprinter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
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
        body: JSON.stringify({ pexels_api_key: config.pexels_api_key })
      });
      if (res.ok) {
        const data = await res.json();
        setPexelsResult({
          valid: true,
          message: data.message || `Conexión Pexels verificada con éxito (${data.total_results || 5000}+ clips disponibles)`
        });
      } else {
        setPexelsResult({ valid: false, message: 'API Key de Pexels inválida o sin respuesta.' });
      }
    } catch (err) {
      setPexelsResult({
        valid: false,
        message: `No se pudo verificar Pexels (red): ${err instanceof Error ? err.message : String(err)}`
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
          voice_name: config.voice_name
        })
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

  const tabs = [
    { id: 'generator' as const, label: 'Generador Rápido', icon: Sparkles },
    { id: 'engine' as const, label: 'Motores IA & API', icon: Settings },
    { id: 'subtitles' as const, label: 'Subtítulos & Audio', icon: Subtitles },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="modal-shell w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="modal-header px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
              MoneyPrinterTurbo Engine
            </h3>
            <p className="text-[11px] mt-0.5 font-sans" style={{ color: 'var(--color-muted)' }}>
              Generación automática de vídeos virales 9:16 mediante IA + Pexels + EdgeTTS
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn-close">✕</button>
        </div>

        {/* Tab Selector — pills style */}
        <div className="flex gap-1 px-4 pt-3 pb-0 text-[11px] font-mono" style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-line)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-t-md transition-colors"
              style={{
                background: activeTab === tab.id ? 'var(--color-surface-3)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-muted)',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === 'generator' && (
            <form onSubmit={handleGenerateVideo} className="space-y-4">
              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-info)' }}>
                  Generar Reel 9:16 con MoneyPrinterTurbo
                </div>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="gen-keyword" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                      Keyword / Nicho Principal
                    </label>
                    <input
                      id="gen-keyword"
                      type="text"
                      required
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="ej. rutina fitness alta intensidad en casa"
                      className="input w-full px-3 py-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="gen-account" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                        Cuenta Instagram de Destino
                      </label>
                      <select
                        id="gen-account"
                        value={targetAccount}
                        onChange={(e) => setTargetAccount(e.target.value)}
                        className="input w-full px-3 py-2"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            @{acc.username} ({acc.device_serial})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="gen-aspect" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                        Formato Aspect Ratio
                      </label>
                      <select
                        id="gen-aspect"
                        value={config.video_aspect}
                        onChange={(e) => setConfig({ ...config, video_aspect: e.target.value as any })}
                        className="input w-full px-3 py-2"
                      >
                        <option value="9:16">9:16 (Reels / TikTok / Shorts)</option>
                        <option value="16:9">16:9 (YouTube Standard)</option>
                        <option value="1:1">1:1 (Post Cuadrado)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="gen-prompt" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>
                      Instrucción Opcional para LLM
                    </label>
                    <textarea
                      id="gen-prompt"
                      rows={2}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="ej. Enfatizar un tono humorístico..."
                      className="input w-full px-3 py-1.5 text-[11px] resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] font-sans flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-info)' }} />
                  <span>Activo: <strong>{config.voice_name}</strong> + Pexels</span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-brand px-5 py-2 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Ejecutando...' : 'Generar & Inyectar'}
                </button>
              </div>

              {genResult && genResult.error && (
                <div className="p-4 border font-mono text-[11px]" style={{ borderColor: 'var(--color-danger)', background: 'rgba(255,59,92,0.1)', color: 'var(--color-danger)', borderRadius: '6px' }}>
                  <div className="font-bold flex items-center gap-2">⚠ Fallo al generar el vídeo</div>
                  <div className="mt-1" style={{ color: 'var(--color-text)' }}>{genResult.error}</div>
                </div>
              )}
              {genResult && !genResult.error && (
                <div className="p-4 border font-mono text-[11px] space-y-2" style={{ borderColor: 'var(--color-info)', background: 'rgba(139,139,149,0.1)', color: 'var(--color-info)', borderRadius: '6px' }}>
                  <div className="font-bold">¡Vídeo procesado e inyectado a la cola ADB!</div>
                  <div style={{ color: 'var(--color-text)' }}>
                    <div>• Job ID: <strong>{genResult.job?.id}</strong></div>
                    <div>• RUTA: <strong>{genResult.job?.video_path}</strong></div>
                    <div>• ESTADO: <strong>Auto-Publicando en @{accounts.find(a => a.id === genResult.job?.target_account)?.username}</strong></div>
                  </div>
                </div>
              )}
            </form>
          )}

          {activeTab === 'engine' && (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Pexels API Key & Clips de Vídeo Stock
                </div>
                <div>
                  <label htmlFor="engine-pexels" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Pexels API Key</label>
                  <div className="flex gap-2">
                    <input
                      id="engine-pexels"
                      type="password"
                      value={config.pexels_api_key}
                      onChange={(e) => setConfig({ ...config, pexels_api_key: e.target.value })}
                      className="input flex-1 px-3 py-1.5"
                    />
                    <button
                      type="button"
                      onClick={handleTestPexels}
                      disabled={testingPexels}
                      className="btn-secondary px-3 py-1.5"
                    >
                      {testingPexels ? 'Verificando...' : 'Probar Key'}
                    </button>
                  </div>
                </div>

                {pexelsResult && (
                  <div
                    className="p-2.5 border text-[11px] flex items-center gap-2"
                    style={{
                      borderColor: pexelsResult.valid ? 'var(--color-info)' : 'var(--color-danger)',
                      background: pexelsResult.valid ? 'rgba(139,139,149,0.1)' : 'rgba(255,59,92,0.1)',
                      color: pexelsResult.valid ? 'var(--color-info)' : 'var(--color-danger)',
                      borderRadius: '6px',
                    }}
                  >
                    <span>{pexelsResult.message}</span>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-info)' }}>
                  Proveedor LLM (Script Generator)
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="engine-llm" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Proveedor LLM</label>
                    <select
                      id="engine-llm"
                      value={config.llm_provider}
                      onChange={(e) => setConfig({ ...config, llm_provider: e.target.value as any })}
                      className="input w-full px-3 py-2"
                    >
                      <option value="gemini">Google Gemini API</option>
                      <option value="openai">OpenAI (gpt-4o-mini)</option>
                      <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                      <option value="deepseek">DeepSeek AI</option>
                      <option value="ollama">Ollama (Local LLM)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="engine-bind" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Puerto / Bind Address</label>
                    <input
                      id="engine-bind"
                      type="text"
                      value={config.bind_address}
                      onChange={(e) => setConfig({ ...config, bind_address: e.target.value })}
                      placeholder="127.0.0.1:8501"
                      className="input w-full px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-brand px-4 py-2"
                >
                  {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'subtitles' && (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-info)' }}>
                  Motor de Síntesis de Voz (TTS)
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sub-voice" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Voz Predeterminada</label>
                    <select
                      id="sub-voice"
                      value={config.voice_name}
                      onChange={(e) => setConfig({ ...config, voice_name: e.target.value })}
                      className="input w-full px-3 py-2"
                    >
                      <option value="es-ES-AlvaroNeural">Álvaro (Español España)</option>
                      <option value="es-MX-DaliaNeural">Dalia (Español México)</option>
                      <option value="en-US-AnaNeural">Ana (English US)</option>
                      <option value="openai-alloy">OpenAI TTS - Alloy</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sub-bgm" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Volumen BGM ({Math.round(config.bgm_volume * 100)}%)</label>
                    <input
                      id="sub-bgm"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.bgm_volume}
                      onChange={(e) => setConfig({ ...config, bgm_volume: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Estilo de Subtítulos FFmpeg SRT
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="sub-font" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Tipografía</label>
                    <input
                      id="sub-font"
                      type="text"
                      value={config.subtitle_font}
                      onChange={(e) => setConfig({ ...config, subtitle_font: e.target.value })}
                      className="input w-full px-3 py-1.5"
                    />
                  </div>

                  <div>
                    <label htmlFor="sub-color" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Color</label>
                    <input
                      id="sub-color"
                      type="color"
                      value={config.subtitle_color}
                      onChange={(e) => setConfig({ ...config, subtitle_color: e.target.value })}
                      className="w-full h-8 px-1 py-1 cursor-pointer"
                      style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '4px' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="sub-size" className="block mb-1 uppercase text-[10px]" style={{ color: 'var(--color-muted)' }}>Tamaño</label>
                    <input
                      id="sub-size"
                      type="number"
                      value={config.subtitle_size}
                      onChange={(e) => setConfig({ ...config, subtitle_size: Number(e.target.value) })}
                      className="input w-full px-3 py-1.5"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-brand px-4 py-2"
                >
                  {saving ? 'Guardando...' : 'Guardar Preferencias'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
