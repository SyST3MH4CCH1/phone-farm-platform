import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'posts' | 'warmup' | 'proxy'>('overview');
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  if (!account) return null;

  const proxy: ProxyItem | undefined = proxies.find(p => p.id === account.proxy_id) || proxies[0];
  const accountJobs = queue.filter(j => j.target_account === account.id || j.target_account === account.username);

  const followers = account.followers_count || 4820;
  const engagementRate = account.engagement_rate || 4.8;
  const niche = account.niche || 'Decoración & Estilo de Vida';

  const getWarmupProgress = () => {
    const pct = Math.min((account.warmup_day / 30) * 100, 100);
    let color = 'ok';
    if (account.warmup_day > 20) color = 'danger';
    else if (account.warmup_day > 10) color = 'warn';
    return { pct, color };
  };
  const warmup = getWarmupProgress();

  const tabs = [
    { id: 'overview' as const, label: 'Resumen' },
    { id: 'posts' as const, label: `Publicaciones (${accountJobs.length})` },
    { id: 'warmup' as const, label: `Warmup (Día ${account.warmup_day})` },
    { id: 'proxy' as const, label: 'Proxy & ADB' },
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
        {/* Header Banner */}
        <div className="modal-header p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-mono" style={{ color: 'var(--color-text)' }}>@{account.username}</h2>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold"
                  style={{
                    color: account.status === 'active' ? 'var(--color-ok)' : 'var(--color-muted)',
                    background: account.status === 'active' ? 'rgba(0,255,136,0.1)' : 'rgba(139,139,149,0.1)',
                    border: `1px solid ${account.status === 'active' ? 'rgba(0,255,136,0.2)' : 'rgba(139,139,149,0.2)'}`,
                  }}
                >
                  {account.status}
                </span>
              </div>
              <p className="text-[11px] font-sans mt-0.5" style={{ color: 'var(--color-muted)' }}>
                Nicho: <strong style={{ color: 'var(--color-muted)' }}>{niche}</strong> · {account.platform || 'Instagram Reels & TikTok'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 z-10">
            <button
              onClick={() => onOpenMoneyPrinterForAccount(account)}
              className="btn-brand px-3.5 py-2 text-[11px] flex items-center gap-1.5"
            >
              Generar Reel
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="btn-close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 px-4 text-[11px] font-mono" style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-line)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 rounded-t-md transition-colors"
              style={{
                background: activeTab === tab.id ? 'var(--color-surface-3)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-brand)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* KPI — 4 numbers inline */}
              <div className="flex gap-4 text-center">
                <div className="flex-1 p-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Seguidores</div>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--color-text)' }}>{followers.toLocaleString()}</div>
                </div>
                <div className="flex-1 p-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Engagement</div>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--color-text)' }}>{engagementRate}%</div>
                </div>
                <div className="flex-1 p-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Likes Hoy</div>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--color-danger)' }}>{account.likes_today || 24}</div>
                </div>
                <div className="flex-1 p-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Follows/Comms</div>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--color-text)' }}>{account.follows_today || 12} / {account.comments_today || 5}</div>
                </div>
              </div>

              {/* Bot Controller */}
              <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <div>
                  <h4 className="font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                    Taktik Bot — Warmup Día {account.warmup_day}
                  </h4>
                  <p className="text-[11px] font-sans mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    Automatiza scroll humano y engagement orgánico según fase del algoritmo.
                  </p>
                </div>
                <button
                  onClick={() => onToggleBot(account.id)}
                  className={account.bot_active ? 'btn-danger px-5 py-2 text-[11px]' : 'btn-brand px-5 py-2 text-[11px]'}
                >
                  {account.bot_active ? 'Detener Taktik Bot' : 'Iniciar Taktik Bot'}
                </button>
              </div>

              {/* Account Technical Details */}
              <div className="p-4 space-y-2" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <h4 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Ficha Técnica & Sesión ADB
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono" style={{ color: 'var(--color-muted)' }}>
                  <div>• ID: <strong style={{ color: 'var(--color-text)' }}>{account.id}</strong></div>
                  <div>• Serial ADB: <strong style={{ color: 'var(--color-text)' }}>{account.device_serial}</strong></div>
                  <div>• Proxy: <strong style={{ color: 'var(--color-text)' }}>{proxy ? `${proxy.host}:${proxy.port}` : '—'}</strong></div>
                  <div>• IP Exit: <strong style={{ color: 'var(--color-text)' }}>{proxy?.ip || '—'}</strong></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold uppercase text-[11px] font-mono" style={{ color: 'var(--color-text)' }}>
                  Historial de Publicaciones
                </h4>
              </div>

              {accountJobs.length === 0 ? (
                <div className="p-8 text-center" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px', color: 'var(--color-muted)' }}>
                  <p>No hay publicaciones registradas para esta cuenta.</p>
                  <button
                    onClick={() => onOpenMoneyPrinterForAccount(account)}
                    className="mt-2 font-bold text-[11px]"
                    style={{ color: 'var(--color-brand)' }}
                  >
                    + Generar primer Reel 9:16
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {accountJobs.map(j => (
                    <div
                      key={j.id}
                      className="p-3 flex items-center justify-between gap-3"
                      style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center font-bold text-[10px]" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-line)', borderRadius: '4px', color: 'var(--color-info)' }}>
                          9:16
                        </div>
                        <div>
                          <div className="font-bold text-[11px] font-mono" style={{ color: 'var(--color-text)' }}>{j.keyword}</div>
                          <div className="text-[10px] font-sans" style={{ color: 'var(--color-muted-2)' }}>
                            {new Date(j.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold"
                        style={{
                          color: j.status === 'published' ? 'var(--color-ok)' : 'var(--color-muted)',
                          background: j.status === 'published' ? 'rgba(0,255,136,0.1)' : 'rgba(139,139,149,0.1)',
                          border: `1px solid ${j.status === 'published' ? 'rgba(0,255,136,0.2)' : 'rgba(139,139,149,0.2)'}`,
                        }}
                      >
                        {j.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'warmup' && (
            <div className="space-y-4">
              <div className="p-4 space-y-3" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <h4 className="font-bold uppercase text-[11px]" style={{ color: 'var(--color-text)' }}>
                  Progreso Warmup — Día {account.warmup_day} de 30
                </h4>
                <p className="text-[11px] font-sans" style={{ color: 'var(--color-muted)' }}>
                  El protocolo incrementa paulatinamente la tasa de interacción para evitar flags.
                </p>

                {/* Progress bar instead of grid */}
                <div className="space-y-2">
                  <div className="progress-bar">
                    <div
                      className={`progress-bar-fill ${warmup.color}`}
                      style={{ width: `${warmup.pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono" style={{ color: 'var(--color-muted-2)' }}>
                    <span>Inicio</span>
                    <span>Día {account.warmup_day}</span>
                    <span>Día 30</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <div className="p-4 space-y-2" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}>
                <h4 className="font-bold uppercase text-[11px]" style={{ color: 'var(--color-text)' }}>
                  Proxy SOCKS5 & Hardware ADB
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono" style={{ color: 'var(--color-muted)' }}>
                  <div>• Proveedor: <strong style={{ color: 'var(--color-text)' }}>{proxy?.provider || '—'}</strong></div>
                  <div>• Protocolo: <strong style={{ color: 'var(--color-text)' }}>{proxy?.type?.toUpperCase() || '—'}</strong></div>
                  <div>• Host: <strong style={{ color: 'var(--color-text)' }}>{proxy ? `${proxy.host}:${proxy.port}` : '—'}</strong></div>
                  <div>• IP Exit: <strong style={{ color: 'var(--color-text)' }}>{proxy?.ip || '—'}</strong></div>
                  <div>• Estado: <strong style={{ color: 'var(--color-text)' }}>{proxy?.status?.toUpperCase() || '—'}</strong></div>
                  <div>• Latencia: <strong style={{ color: 'var(--color-text)' }}>{proxy?.latency_ms || '—'} ms</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
