import React, { useState } from 'react';
import { Account, ProxyItem } from '../types';
import { UserCircle } from 'lucide-react';

interface AccountsPanelProps {
  accounts: Account[];
  proxies: ProxyItem[];
  onToggleBot: (accountId: string) => void;
  onAddAccount: (acc: Partial<Account>) => void;
  onDeleteAccount: (accountId: string) => void;
  onSelectAccountForDetail?: (account: Account) => void;
}

export const AccountsPanel: React.FC<AccountsPanelProps> = ({
  accounts,
  proxies,
  onToggleBot,
  onAddAccount,
  onDeleteAccount,
  onSelectAccountForDetail
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newSerial, setNewSerial] = useState('RFCW80' + Math.floor(10000 + Math.random() * 90000));
  const [newProxyId, setNewProxyId] = useState(proxies[0]?.id || 'proxy_01');
  const [newWarmupDay, setNewWarmupDay] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername) return;
    onAddAccount({
      username: newUsername,
      password: newPassword,
      device_serial: newSerial,
      proxy_id: newProxyId,
      warmup_day: Number(newWarmupDay)
    });
    setNewUsername('');
    setNewPassword('');
    setShowAddModal(false);
  };

  const getWarmupColor = (day: number) => {
    if (day <= 7) return { color: 'var(--color-warn)', bg: 'rgba(255,184,0,0.1)' };
    if (day <= 14) return { color: 'var(--color-info)', bg: 'rgba(139,139,149,0.1)' };
    return { color: 'var(--color-ok)', bg: 'rgba(0,255,136,0.1)' };
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)' }}>
      {/* Panel Header */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-line)' }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
          Cuentas <span style={{ color: 'var(--color-muted)' }}>({accounts.length})</span>
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-brand text-[10px] px-2.5 py-1 flex items-center gap-1"
        >
          + Nueva Cuenta
        </button>
      </div>

      {/* Account Rows — dense list */}
      <div className="flex-1 overflow-y-auto">
        {accounts.map((acc) => {
          const proxy = proxies.find(p => p.id === acc.proxy_id);
          const warmup = getWarmupColor(acc.warmup_day);

          return (
            <div
              key={acc.id}
              className="px-4 py-3 border-b transition-colors cursor-pointer"
              style={{ borderColor: 'var(--color-line)', background: acc.bot_active ? 'rgba(0,255,136,0.03)' : undefined }}
              onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectAccountForDetail && onSelectAccountForDetail(acc)}
              aria-label={`Cuenta ${acc.username}, día de warmup ${acc.warmup_day}`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Identity */}
                <div className="flex items-center gap-2.5">
                  {/* User icon con color warmup */}
                  <UserCircle
                    size={28}
                    style={{ color: warmup.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm font-mono" style={{ color: 'var(--color-text)' }}>
                        @{acc.username}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ color: warmup.color, background: warmup.bg }}
                      >
                        Día {acc.warmup_day}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {acc.device_serial} · {acc.proxy_id}
                    </div>
                  </div>
                </div>

                {/* Bot toggle switch */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleBot(acc.id); }}
                  className="shrink-0 w-10 h-5 rounded-full transition-colors relative"
                  style={{
                    background: acc.bot_active ? 'var(--color-ok)' : 'var(--color-surface-3)',
                    border: `1px solid ${acc.bot_active ? 'var(--color-ok)' : 'var(--color-line)'}`,
                  }}
                  aria-label={acc.bot_active ? `Detener bot de ${acc.username}` : `Iniciar bot de ${acc.username}`}
                  aria-pressed={acc.bot_active}
                >
                  <span
                    className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-transform"
                    style={{
                      background: acc.bot_active ? '#0A0A0B' : 'var(--color-muted)',
                      transform: acc.bot_active ? 'translateX(18px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              {/* Stats inline */}
              <div className="mt-2 pt-2 grid grid-cols-3 gap-2 text-[10px] font-mono" style={{ borderTop: '1px solid var(--color-line)' }}>
                <div>
                  <span style={{ color: 'var(--color-muted)' }}>Likes </span>
                  <strong style={{ color: 'var(--color-text)' }}>{acc.likes_today || 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-muted)' }}>Follows </span>
                  <strong style={{ color: 'var(--color-text)' }}>{acc.follows_today || 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-muted)' }}>Comms </span>
                  <strong style={{ color: 'var(--color-danger)' }}>{acc.comments_today || 0}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="modal-shell w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby="add-account-title">
            <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid var(--color-line)' }}>
              <h3 id="add-account-title" className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
                Registrar Nueva Cuenta IG
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-close"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 font-mono mt-4">
              <div>
                <label htmlFor="new-username" className="block text-xs mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Username de Instagram</label>
                <input
                  id="new-username"
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ej. nicho_recetas_saludables"
                  className="input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-xs mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password123!"
                  className="input w-full px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-serial" className="block text-xs mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>ADB Device Serial</label>
                  <input
                    id="new-serial"
                    type="text"
                    required
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    className="input w-full px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="new-proxy" className="block text-xs mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Proxy Asignado</label>
                  <select
                    id="new-proxy"
                    value={newProxyId}
                    onChange={(e) => setNewProxyId(e.target.value)}
                    className="input w-full px-3 py-2 text-xs"
                  >
                    {proxies.map((p) => (
                      <option key={p.id} value={p.id}>{p.id} ({p.provider})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="new-warmup" className="block text-xs mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Día de Warmup Actual (1 a 30)</label>
                <input
                  id="new-warmup"
                  type="number"
                  min="1"
                  max="30"
                  value={newWarmupDay}
                  onChange={(e) => setNewWarmupDay(Number(e.target.value))}
                  className="input w-full px-3 py-2 text-xs"
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-muted-2)' }}>
                  Días ≤7 = Max 30 acc/día | 8-14 = 50 | &gt;14 = 100
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--color-line)' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-brand text-xs px-4 py-1.5"
                >
                  Guardar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
