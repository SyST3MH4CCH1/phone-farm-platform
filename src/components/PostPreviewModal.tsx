import React, { useState } from 'react';
import { Smartphone, Play, Pause, CheckCircle2, Edit3, Share2, Instagram, Eye, Sparkles, Send, Music, Heart, MessageCircle, RefreshCw, X } from 'lucide-react';
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
  if (!draft) return null;

  const [isPlaying, setIsPlaying] = useState(true);
  const [caption, setCaption] = useState(draft.caption || draft.script || '🔥 Nuevo contenido exclusivo generado con #MoneyPrinterTurbo');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'both'>(draft.platform || 'both');
  const [hashtagsStr, setHashtagsStr] = useState((draft.hashtags || ['#viral', '#reels', '#shorts', '#trending']).join(' '));
  const [isPublishing, setIsPublishing] = useState(false);

  const targetAccount = accounts.find(a => a.id === draft.target_account_id) || accounts[0];

  const handlePublish = async () => {
    setIsPublishing(true);
    const parsedHashtags = hashtagsStr.split(' ').map(h => h.trim()).filter(h => h.startsWith('#'));
    await onApproveAndPublish(draft.id, `${caption}\n\n${parsedHashtags.join(' ')}`, platform);
    setIsPublishing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-[#0F1829] px-6 py-4 border-b border-[#1E2C42] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE] shadow-lg">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Previsualizador de Publicaciones & Reels
                <span className="text-[10px] bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30 px-2 py-0.5 rounded-full font-sans">
                  MoneyPrinterTurbo 9:16 Frame
                </span>
              </h3>
              <p className="text-[11px] text-[#94A3B8] font-sans">
                Inspecciona y edita el vídeo, guión, hashtags y cuenta antes de enviar la orden a ADB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 text-xs">
          {/* Left Column: Simulated Phone 9:16 Mockup (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[270px] aspect-[9/16] bg-[#0B1320] border-4 border-[#1E2C42] rounded-[32px] overflow-hidden shadow-2xl flex flex-col justify-between p-3 group">
              {/* Phone Camera Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black/80 rounded-full z-30 border border-white/10" />

              {/* Simulated Video Canvas */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#0B1320] via-[#101A2D] to-[#070D18] flex flex-col items-center justify-center p-4">
                {/* Background animated texture */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(0,229,190,0.15),transparent_60%)]" />
                
                {/* Play/Pause Control overlay */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-[#00E5BE]/40 flex items-center justify-center text-[#00E5BE] z-20 hover:scale-110 transition-transform shadow-xl"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-[#00E5BE]" />}
                </button>

                <div className="absolute top-8 left-3 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-[#1E2C42] text-[10px] text-[#4DFFE0] flex items-center gap-1 z-20 font-mono">
                  <Sparkles className="w-3 h-3 text-[#00E5BE]" />
                  <span>{draft.aspect_ratio || '9:16'} HD</span>
                </div>
              </div>

              {/* Instagram/TikTok UI Overlays */}
              <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-white z-20">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                  </div>
                  <span className="text-[9px] font-bold mt-0.5">2.4k</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[9px] font-bold mt-0.5">148</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#00E5BE] p-0.5 animate-spin">
                  <div className="w-full h-full rounded-full bg-[#090D16] flex items-center justify-center">
                    <Music className="w-3.5 h-3.5 text-[#00E5BE]" />
                  </div>
                </div>
              </div>

              {/* Bottom Video Info Overlay */}
              <div className="mt-auto z-20 space-y-1 text-left text-white drop-shadow-md">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <span className="text-[#00E5BE]">@{targetAccount?.username || 'cuenta'}</span>
                  <span className="text-[9px] bg-[#00E5BE]/20 text-[#00E5BE] border border-[#00E5BE]/30 px-1 rounded">Verificado ADB</span>
                </div>
                <p className="text-[10px] text-neutral-200 line-clamp-2 font-sans leading-snug">
                  {caption}
                </p>
                <div className="text-[9px] text-[#4DFFE0] font-mono truncate">
                  {hashtagsStr}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#64748B] mt-2 font-sans">
              Vista previa fiel al renderizado final en pantalla de teléfono Android
            </p>
          </div>

          {/* Right Column: Editing Form & Approval Details (7 cols) */}
          <div className="md:col-span-7 space-y-4 text-xs flex flex-col justify-between">
            <div className="space-y-4">
              {/* Target Platform Selection */}
              <div className="bg-[#0B1320] border border-[#1E2C42] rounded-xl p-4 space-y-2">
                <label className="block text-[#4DFFE0] font-bold uppercase text-[10px] tracking-wide">
                  Red Social de Publicación Destino
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('instagram')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'instagram'
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300 shadow-md'
                        : 'bg-[#101A2D] border-[#1E2C42] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Instagram className="w-4 h-4" /> Instagram
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatform('tiktok')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'tiktok'
                        ? 'bg-[#4DFFE0]/20 border-[#4DFFE0] text-[#4DFFE0] shadow-md'
                        : 'bg-[#101A2D] border-[#1E2C42] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Share2 className="w-4 h-4" /> TikTok
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatform('both')}
                    className={`px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      platform === 'both'
                        ? 'bg-[#00E5BE]/20 border-[#00E5BE] text-[#00E5BE] shadow-md'
                        : 'bg-[#101A2D] border-[#1E2C42] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-[#00E5BE]" /> Ambos (Multi-ADB)
                  </button>
                </div>
              </div>

              {/* Caption & Description Editor */}
              <div className="bg-[#0B1320] border border-[#1E2C42] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[#4DFFE0] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-[#00E5BE]" /> Texto de Publicación / Caption
                  </label>
                  <span className="text-[10px] text-[#64748B]">{caption.length} caracteres</span>
                </div>

                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escribe el texto descriptivo del Reel..."
                  className="w-full bg-[#101A2D] border border-[#1E2C42] rounded-lg p-3 text-white focus:outline-none focus:border-[#00E5BE] font-sans text-xs leading-relaxed"
                />

                <div>
                  <label className="block text-[#94A3B8] mb-1 uppercase text-[10px]">
                    Hashtags Virales (Separados por espacio)
                  </label>
                  <input
                    type="text"
                    value={hashtagsStr}
                    onChange={(e) => setHashtagsStr(e.target.value)}
                    className="w-full bg-[#101A2D] border border-[#1E2C42] rounded-lg px-3 py-2 text-[#4DFFE0] focus:outline-none focus:border-[#00E5BE] text-xs font-mono"
                  />
                </div>
              </div>

              {/* Generated Script Summary */}
              <div className="bg-[#0B1320] border border-[#1E2C42] rounded-xl p-3 space-y-1">
                <span className="text-[10px] text-[#4DFFE0] font-bold uppercase tracking-wider block">
                  Guión Generado por IA (VoiceTTS: {draft.voice_tts || 'es-ES-AlvaroNeural'}):
                </span>
                <p className="text-[11px] text-[#94A3B8] italic font-sans bg-[#101A2D] p-2.5 rounded border border-[#1E2C42] line-clamp-3">
                  "{draft.script || draft.caption}"
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between border-t border-[#1E2C42] pt-4 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-[#1E2C42] text-[#94A3B8] hover:text-white hover:bg-white/5 font-bold transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Publicando en Dispositivo ADB...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#090D16]" />
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
