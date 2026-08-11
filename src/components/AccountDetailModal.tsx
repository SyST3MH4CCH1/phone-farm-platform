import React, { useState } from 'react';
import { Account, ProxyItem, QueueJob } from '../types';

interface AccountDetailModalProps {
  account: Account | null;
  proxies: ProxyItem[];
  queue: QueueJob[];
  onClose: () => void;
  onToggleBot: (accountId: string) => void;
  onOpenMoneyPrinterForAccount: (account: Account) => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  account,
  proxies,
  queue,
  onClose,
  onToggleBot,
  onOpenMoneyPrinterForAccount
}) => {
  if (!account) return null;

  const [activeTab, setActiveTab] = useState<'overview' | 'posts' | 'warmup' | 'proxy'>('overview');

  const proxy: ProxyItem | undefined = proxies.find(p => p.id === account.proxy_id) || proxies[0];
  const accountJobs = queue.filter(j => j.target_account === account.id || j.target_account === account.username);

  const followers = account.followers_count || 4820;
  const following = account.following_count || 1240;
  const postsCount = account.posts_count || accountJobs.filter(j => j.status === 'published').length || 18;
  const engagementRate = account.engagement_rate || 4.8;
  const niche = account.niche || 'Decoración & Estilo de Vida';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Banner */}
        <div className="bg-[#232528] p-6 border-b border-[#2A2C30] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="w-14 h-14 rounded-2xl bg-[#8A8F98]/10 border border-[#8A8F98]/30 p-0.5">
              <div className="w-full h-full rounded-[14px] bg-[#1A1C1E] flex items-center justify-center text-[#8A8F98] font-bold text-lg">
                @{account.username.substring(0, 2).toUpperCase()}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#E5E5E5] tracking-wide">@{account.username}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold ${
                  account.status === 'active'
                    ? 'bg-[#8A8F98]/10 text-[#8A8F98] border-[#8A8F98]/30'
                    : 'bg-[#A1A6AE]/10 text-[#A1A6AE] border-[#A1A6AE]/30'
                }`}>
                  {account.status}
                </span>
                {account.bot_active && (
                  <span className="text-[10px] bg-[#A1A6AE]/10 text-[#A1A6AE] border border-[#A1A6AE]/30 px-2 py-0.5 rounded-full animate-pulse">
                    Bot Taktik Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-[#9CA1A8] font-sans mt-0.5 flex items-center gap-2">
                <span>Nicho: <strong className="text-[#A1A6AE]">{niche}</strong></span> •
                <span>Plataforma: <strong className="text-[#8A8F98]">{account.platform || 'Instagram Reels & TikTok'}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 z-10">
            <button
              onClick={() => onOpenMoneyPrinterForAccount(account)}
              className="px-3.5 py-2 bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all"
            > Generar Reel
            </button>
            <button
              onClick={onClose}
              className="text-[#9CA1A8] hover:text-[#E5E5E5] p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#2A2C30] bg-[#1A1C1E] text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-5 py-3 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#8A8F98] text-[#8A8F98] bg-[#1E2023]'
                : 'border-transparent text-[#9CA1A8] hover:text-[#E5E5E5]'
            }`}
          > Resumen & Métricas
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-5 py-3 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-[#8A8F98] text-[#8A8F98] bg-[#1E2023]'
                : 'border-transparent text-[#9CA1A8] hover:text-[#E5E5E5]'
            }`}
          > Publicaciones ({accountJobs.length})
          </button>
          <button
            onClick={() => setActiveTab('warmup')}
            className={`px-5 py-3 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'warmup'
                ? 'border-[#8A8F98] text-[#8A8F98] bg-[#1E2023]'
                : 'border-transparent text-[#9CA1A8] hover:text-[#E5E5E5]'
            }`}
          > Progreso Warmup (Día {account.warmup_day})
          </button>
          <button
            onClick={() => setActiveTab('proxy')}
            className={`px-5 py-3 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'proxy'
                ? 'border-[#8A8F98] text-[#8A8F98] bg-[#1E2023]'
                : 'border-transparent text-[#9CA1A8] hover:text-[#E5E5E5]'
            }`}
          > Proxy & Hardware ADB
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* KPI Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-[#9CA1A8] uppercase tracking-wider block">Seguidores</span>
                  <div className="text-lg font-bold text-[#E5E5E5] flex items-center justify-between">
                    <span>{followers.toLocaleString()}</span>
                    <span className="text-[10px] text-[#8A8F98] font-sans">+12.4% este mes</span>
                  </div>
                </div>

                <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-[#9CA1A8] uppercase tracking-wider block">Engagement Rate</span>
                  <div className="text-lg font-bold text-[#A1A6AE] flex items-center justify-between">
                    <span>{engagementRate}%</span>
                    <span className="text-[10px] font-sans text-[#8A8F98]">Alto</span>
                  </div>
                </div>

                <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-[#9CA1A8] uppercase tracking-wider block">Likes Hoy</span>
                  <div className="text-lg font-bold text-rose-400 flex items-center justify-between">
                    <span>{account.likes_today || 24}</span>
                  </div>
                </div>

                <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-[#9CA1A8] uppercase tracking-wider block">Follows / Comments</span>
                  <div className="text-lg font-bold text-[#A1A6AE] flex items-center justify-between">
                    <span>{account.follows_today || 12} / {account.comments_today || 5}</span>
                  </div>
                </div>
              </div>

              {/* Bot Controller Banner */}
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-1 text-center sm:text-left">
                  <h4 className="font-bold text-[#E5E5E5] flex items-center gap-2"> State Machine Taktik Bot (Warmup Día {account.warmup_day})
                  </h4>
                  <p className="text-[11px] text-[#9CA1A8] font-sans">
                    Automatiza scroll humano, likes aleatorios a competidores y comentarios orgánicos según la fase del algoritmo.
                  </p>
                </div>

                <button
                  onClick={() => onToggleBot(account.id)}
                  className={`px-5 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 text-xs ${
                    account.bot_active
                      ? 'bg-[#232528] border border-[#2A2C30] text-[#E05B5B] hover:bg-[#2A2C30]'
                      : 'bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023]'
                  }`}
                >
                  {account.bot_active ? 'Detener Taktik Bot' : 'Iniciar Taktik Bot'}
                </button>
              </div>

              {/* Account Technical Details */}
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-[#A1A6AE] uppercase tracking-wide">
                  Ficha Técnica & Configuración de Sesión ADB
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[#9CA1A8] font-mono text-[11px]">
                  <div>• ID Cuenta Interno: <strong className="text-[#E5E5E5]">{account.id}</strong></div>
                  <div>• Dispositivo Serial ADB: <strong className="text-[#A1A6AE]">{account.device_serial}</strong></div>
                  <div>• Archivo Sesión instagrapi: <strong className="text-[#8A8F98]">{account.session_file}</strong></div>
                  <div>• Proxy SOCKS5 Asignado: <strong className="text-[#A1A6AE]">{proxy ? `${proxy.host}:${proxy.port}` : '—'}</strong></div>
                  <div>• IP Salida Dedicada: <strong className="text-[#8A8F98]">{proxy?.ip || '—'}</strong></div>
                  <div>• Latencia de Respuesta: <strong className="text-[#E5E5E5]">{proxy?.latency_ms || '—'} ms</strong></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#E5E5E5] uppercase text-xs">Historial de Publicaciones de @{account.username}</h4>
                <span className="text-[11px] text-[#9CA1A8] font-sans">Generados con MoneyPrinterTurbo</span>
              </div>

              {accountJobs.length === 0 ? (
                <div className="p-8 text-center bg-[#1A1C1E] border border-[#2A2C30] rounded-xl text-[#9CA1A8] space-y-2">
                  <p>No hay publicaciones registradas para esta cuenta todavía.</p>
                  <button
                    onClick={() => onOpenMoneyPrinterForAccount(account)}
                    className="text-[#8A8F98] hover:underline font-bold text-xs"
                  >
                    + Generar primer Reel 9:16 ahora
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {accountJobs.map(j => (
                    <div key={j.id} className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#1E2023] border border-[#2A2C30] flex items-center justify-center text-[#8A8F98] font-bold">
                          9:16
                        </div>
                        <div>
                          <div className="font-bold text-[#E5E5E5] text-xs">{j.keyword}</div>
                          <div className="text-[10px] text-[#9CA1A8] font-sans">
                            ID: {j.id} • {new Date(j.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold ${
                          j.status === 'published' ? 'bg-[#8A8F98]/10 text-[#8A8F98] border-[#8A8F98]/30' : 'bg-[#A1A6AE]/10 text-[#A1A6AE] border-[#A1A6AE]/30'
                        }`}>
                          {j.status}
                        </span>
                        {j.media_id && (
                          <span className="text-[10px] text-[#A1A6AE] font-mono hidden sm:inline">
                            Media ID: {j.media_id.substring(0, 10)}...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'warmup' && (
            <div className="space-y-4">
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-[#E5E5E5] uppercase text-xs">Cronograma del Calentamiento de Cuenta (Warmup Protocol)</h4>
                <p className="text-[11px] text-[#9CA1A8] font-sans">
                  El protocolo incrementa paulatinamente la tasa de interacción para evitar flags en el algoritmo de Meta / TikTok.
                </p>

                <div className="grid grid-cols-5 gap-2 pt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(day => (
                    <div
                      key={day}
                      className={`p-2.5 rounded-lg border text-center font-mono ${
                        day <= account.warmup_day
                          ? 'bg-[#8A8F98]/10 border-[#8A8F98]/40 text-[#8A8F98]'
                          : 'bg-[#1E2023] border-[#2A2C30] text-[#6B7076]'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">Día {day}</div>
                      <div className="text-[9px] mt-1 font-sans">
                        {day <= account.warmup_day ? 'Completado' : 'Pendiente'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-[#E5E5E5] uppercase text-xs">Información del Proxy SOCKS5 Dedicado</h4>
                <div className="grid grid-cols-2 gap-3 text-[11px] text-[#9CA1A8]">
                  <div>• Proveedor: <strong className="text-[#E5E5E5]">{proxy?.provider || '—'}</strong></div>
                  <div>• Protocolo: <strong className="text-[#E5E5E5]">{proxy?.type?.toUpperCase() || '—'}</strong></div>
                  <div>• Host & Puerto: <strong className="text-[#E5E5E5]">{proxy ? `${proxy.host}:${proxy.port}` : '—'}</strong></div>
                  <div>• IP Pública Exit: <strong className="text-[#A1A6AE]">{proxy?.ip || '—'}</strong></div>
                  <div>• Estado Proxy: <strong className="text-[#8A8F98]">{proxy?.status?.toUpperCase() || '—'}</strong></div>
                  <div>• Latencia de Respuesta: <strong className="text-[#E5E5E5]">{proxy?.latency_ms || '—'} ms</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
