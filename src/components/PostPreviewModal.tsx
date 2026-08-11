import React, { useState } from 'react';
import { DraftPost, Account } from '../types';

interface PostPreviewModalProps {
  draft: DraftPost | null;
  accounts: Account[];
  onClose: () => void;
  onApproveAndPublish: (draftId: string, updatedCaption: string, platform: 'instagram' | 'tiktok' | 'both') => void;
}

export const PostPreviewModal: React.FC<PostPreviewModalProps> = ({
  draft,
  accounts,
  onClose,
  onApproveAndPublish
}) => {
  // Hooks SIEMPRE antes del return condicional (regla de hooks de React)
  const [isPlaying, setIsPlaying] = useState(true);
  const [caption, setCaption] = useState(draft?.caption || '');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'both'>(draft?.platform || 'instagram');
  const [hashtagsStr, setHashtagsStr] = useState((draft?.hashtags || []).join(' '));
  const [isPublishing, setIsPublishing] = useState(false);

  if (!draft) return null;

  const targetAccount = accounts.find(a => a.id === draft.target_account_id) || accounts[0];

  const handlePublish = async () => {
    setIsPublishing(true);
    const parsedHashtags = hashtagsStr.split(' ').map(h => h.trim()).filter(h => h.startsWith('#'));
    await onApproveAndPublish(draft.id, `${caption}\n\n${parsedHashtags.join(' ')}`, platform);
    setIsPublishing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-[#232528] px-6 py-4 border-b border-[#2A2C30] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#8A8F98]/10 border border-[#8A8F98]/30 flex items-center justify-center text-[#8A8F98]">
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider flex items-center gap-2">
                Previsualizador de Publicaciones & Reels
                <span className="text-[10px] bg-[#8A8F98]/10 text-[#8A8F98] border border-[#8A8F98]/30 px-2 py-0.5 rounded-full font-sans">
                  MoneyPrinterTurbo 9:16 Frame
                </span>
              </h3>
              <p className="text-[11px] text-[#9CA1A8] font-sans">
                Inspecciona y edita el vídeo, guión, hashtags y cuenta antes de enviar la orden a ADB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA1A8] hover:text-[#E5E5E5] p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 text-xs">
          {/* Left Column: Phone 9:16 with REAL video (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[270px] aspect-[9/16] bg-[#1A1C1E] border-4 border-[#2A2C30] rounded-[32px] overflow-hidden flex flex-col justify-between p-3 group">
              {/* Phone Camera Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black/80 rounded-full z-30 border border-white/10" />

              {/* Vídeo REAL del MP4 generado (o placeholder sin métricas) */}
              <div className="absolute inset-0 bg-[#17181A] flex flex-col items-center justify-center p-4">
                {draft.video_url ? (
                  <video
                    src={draft.video_url}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-[#6B7076] font-mono text-[11px] space-y-2">
                    <div className="w-14 h-14 rounded-full bg-[#232528] border border-[#2A2C30] flex items-center justify-center mx-auto">
                      {isPlaying ? '▶' : '▶'}
                    </div>
                    <p>Vídeo aún no generado</p>
                    <p className="text-[10px]">Se generará al aprobar el guión (etapa 2 del pipeline)</p>
                  </div>
                )}

                <div className="absolute top-8 left-3 bg-black/70 px-2 py-0.5 rounded-full border border-[#2A2C30] text-[10px] text-[#A1A6AE] z-20 font-mono">
                  <span>{draft.aspect_ratio || '9:16'} HD</span>
                </div>
              </div>

              {/* Overlays IG — SIN métricas inventadas (el post aún no se publica) */}
              <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-[#E5E5E5] z-20">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center">
                  </div>
                  <span className="text-[9px] font-bold mt-0.5">—</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center">
                  </div>
                  <span className="text-[9px] font-bold mt-0.5">—</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#8A8F98] p-0.5 animate-spin">
                  <div className="w-full h-full rounded-full bg-[#1E2023] flex items-center justify-center">
                  </div>
                </div>
              </div>

              {/* Bottom Video Info Overlay */}
              <div className="mt-auto z-20 space-y-1 text-left text-[#E5E5E5] drop-shadow-md">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <span className="text-[#8A8F98]">@{targetAccount?.username || 'cuenta'}</span>
                  <span className="text-[9px] bg-[#8A8F98]/20 text-[#8A8F98] border border-[#8A8F98]/30 px-1 rounded">Verificado ADB</span>
                </div>
                <p className="text-[10px] text-[#E5E5E5] line-clamp-2 font-sans leading-snug">
                  {caption}
                </p>
                <div className="text-[9px] text-[#A1A6AE] font-mono truncate">
                  {hashtagsStr}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#6B7076] mt-2 font-sans">
              Vista previa fiel al renderizado final en pantalla de teléfono Android
            </p>
          </div>

          {/* Right Column: Editing Form & Approval Details (7 cols) */}
          <div className="md:col-span-7 space-y-4 text-xs flex flex-col justify-between">
            <div className="space-y-4">
              {/* Target Platform Selection */}
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 space-y-2">
                <label className="block text-[#A1A6AE] font-bold uppercase text-[10px] tracking-wide">
                  Red Social de Publicación Destino
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('instagram')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'instagram'
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                        : 'bg-[#1E2023] border-[#2A2C30] text-[#9CA1A8] hover:text-[#E5E5E5]'
                    }`}
                  > Instagram
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatform('tiktok')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'tiktok'
                        ? 'bg-[#A1A6AE]/20 border-[#A1A6AE] text-[#A1A6AE]'
                        : 'bg-[#1E2023] border-[#2A2C30] text-[#9CA1A8] hover:text-[#E5E5E5]'
                    }`}
                  > TikTok
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatform('both')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'both'
                        ? 'bg-[#8A8F98]/20 border-[#8A8F98] text-[#8A8F98]'
                        : 'bg-[#1E2023] border-[#2A2C30] text-[#9CA1A8] hover:text-[#E5E5E5]'
                    }`}
                  > Ambos (Multi-ADB)
                  </button>
                </div>
              </div>

              {/* Caption & Description Editor */}
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[#A1A6AE] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1.5"> Texto de Publicación / Caption
                  </label>
                  <span className="text-[10px] text-[#6B7076]">{caption.length} caracteres</span>
                </div>

                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escribe el texto descriptivo del Reel..."
                  className="w-full bg-[#1E2023] border border-[#2A2C30] rounded-lg p-3 text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98] font-sans text-xs leading-relaxed"
                />

                <div>
                  <label className="block text-[#9CA1A8] mb-1 uppercase text-[10px]">
                    Hashtags Virales (Separados por espacio)
                  </label>
                  <input
                    type="text"
                    value={hashtagsStr}
                    onChange={(e) => setHashtagsStr(e.target.value)}
                    className="w-full bg-[#1E2023] border border-[#2A2C30] rounded-lg px-3 py-2 text-[#A1A6AE] focus:outline-none focus:border-[#8A8F98] text-xs font-mono"
                  />
                </div>
              </div>

              {/* Generated Script Summary */}
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3 space-y-1">
                <span className="text-[10px] text-[#A1A6AE] font-bold uppercase tracking-wider block">
                  Guión Generado por IA (VoiceTTS: {draft.voice_tts || 'es-ES-AlvaroNeural'}):
                </span>
                <p className="text-[11px] text-[#9CA1A8] italic font-sans bg-[#1E2023] p-2.5 rounded border border-[#2A2C30] line-clamp-3">
                  "{draft.script || draft.caption}"
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between border-t border-[#2A2C30] pt-4 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-[#2A2C30] text-[#9CA1A8] hover:text-[#E5E5E5] hover:bg-white/5 font-bold transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <span>Publicando en Dispositivo ADB...</span>
                  </>
                ) : (
                  <>
                    <span>Aprobar & Publicar Ahora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
