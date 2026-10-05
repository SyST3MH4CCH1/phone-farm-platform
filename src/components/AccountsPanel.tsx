import React, { useEffect, useState } from 'react';
import { Account, ProxyItem } from '../types';
import { UserCircle } from 'lucide-react';

interface AccountsPanelProps {
  accounts: Account[];
  proxies: ProxyItem[];
  /**
   * @deprecated desde Fase A: sin engagement automation, el toggle de bot ya
   * no tiene backend. Se conserva el botón en la UI por compat pero no
   * llama a nada si no se pasa handler. Sera eliminado en Fase D.
   */
  onToggleBot?: (accountId: string) => void;
  onAddAccount: (acc: Partial<Account>) => Promise<string | null>;
  onDeleteAccount: (accountId: string) => void;
  onSelectAccountForDetail?: (account: Account) => void;
}

type DailyEngagement = { day: string; likes: number; follows: number; comms: number };
const HISTORY_KEY = 'phonefarm-dashboard-engagement-v1';
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const readHistory = (key: string): DailyEngagement[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((entry): entry is DailyEngagement =>
      typeof entry?.day === 'string' && ['likes', 'follows', 'comms'].every(key => typeof entry[key] === 'number')) : [];
  } catch { return []; }
};

const EngagementChart: React.FC<{ history: DailyEngagement[]; days: string[] }> = ({ history, days }) => {
  const available = days.map(day => history.find(entry => entry.day === day) ?? null);
  if (available.filter(Boolean).length < 2) {
    return <div className="relative h-24 w-full flex items-center justify-center border-y border-dashed border-[var(--color-line)]" role="status"><span className="text-[10px] font-mono text-[var(--color-muted-2)]">Sin historial diario disponible</span></div>;
  }
  const observedMax = Math.max(1, ...available.flatMap(entry => entry ? [entry.likes, entry.follows, entry.comms] : []));
  const tick = Math.max(25, Math.ceil(observedMax / 75) * 25);
  const max = tick * 3;
  const segmentsFor = (key: 'likes' | 'follows' | 'comms') => {
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let current: Array<{ x: number; y: number }> = [];
    available.forEach((entry, i) => {
      if (!entry) { if (current.length) segments.push(current); current = []; return; }
      current.push({ x: 30 + i * 48, y: 80 - entry[key] / max * 70 });
    });
    if (current.length) segments.push(current);
    return segments;
  };
  const smoothPath = (points: Array<{ x: number; y: number }>) => {
    const path = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 0; i < points.length - 1; i++) {
      const before = points[i - 1] ?? points[i];
      const start = points[i];
      const end = points[i + 1];
      const after = points[i + 2] ?? end;
      path.push(`C ${start.x + (end.x - before.x) / 6} ${start.y + (end.y - before.y) / 6} ${end.x - (after.x - start.x) / 6} ${end.y - (after.y - start.y) / 6} ${end.x} ${end.y}`);
    }
    return path.join(' ');
  };
  return <svg className="w-full h-24" viewBox="0 0 320 82" preserveAspectRatio="none" role="img" aria-label="Rendimiento real de Likes, Follows y Comms de los últimos siete días">
    <defs>{([['likes', '#3b82f6'], ['follows', '#a855f7'], ['comms', '#22c55e']] as const).map(([key, color]) => <linearGradient id={`engagement-${key}`} key={key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient>)}</defs>
    {[0, 1, 2, 3].map(i => { const y = 10 + i * 70 / 3; return <g key={i}><line x1="30" x2="318" y1={y} y2={y} stroke="#28343e" strokeDasharray={i === 3 ? undefined : '3 3'}/><text x="25" y={y + 3} textAnchor="end" fill="#8299ad" fontSize="8">{max - i * tick}</text></g>; })}
    {([['likes', '#3b82f6'], ['follows', '#a855f7'], ['comms', '#22c55e']] as const).map(([key, color]) => segmentsFor(key).map((segment, index) => <g key={`${key}-${index}`}>
      {segment.length > 1 && <><path d={`${smoothPath(segment)} L ${segment[segment.length - 1].x} 82 L ${segment[0].x} 82 Z`} fill={`url(#engagement-${key})`}/><path d={smoothPath(segment)} fill="none" stroke={color} strokeWidth="1.8"/></>}
      {segment.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={color}/>)}
    </g>))}
  </svg>;
};

export const AccountsPanel: React.FC<AccountsPanelProps> = ({
  accounts,
  proxies,
  onAddAccount,
  onDeleteAccount,
  onSelectAccountForDetail
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  // ADR-007 / TASK §0: no inventar datos. El usuario debe teclear el serial
  // real (adb devices → "List of devices attached" muestra el id del equipo).
  const [newSerial, setNewSerial] = useState('');
  const [newProxyId, setNewProxyId] = useState(proxies[0]?.id || '');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState<DailyEngagement[]>([]);
  const recentDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(); day.setDate(day.getDate() - 6 + i); return localDayKey(day);
  });

  useEffect(() => {
    if (!accounts.length) {
      setHistory([]);
      return;
    }
    const key = `${HISTORY_KEY}:${accounts.map(account => account.id).sort().join('|')}`;
    const day = localDayKey(new Date());
    const snapshot: DailyEngagement = {
      day,
      likes: accounts.reduce((sum, account) => sum + (account.likes_today ?? 0), 0),
      follows: accounts.reduce((sum, account) => sum + (account.follows_today ?? 0), 0),
      comms: accounts.reduce((sum, account) => sum + (account.comments_today ?? 0), 0),
    };
    const previous = readHistory(key);
    const next = [...previous.filter(entry => entry.day !== day), snapshot].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
    }
    setHistory(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername) return;
    setAdding(true); setAddError('');
    try {
      const error = await onAddAccount({
        username: newUsername,
        device_serial: newSerial,
        proxy_id: newProxyId
      });
      if (error) { setAddError(error); return; }
      setNewUsername(''); setShowAddModal(false);
    } catch (cause) { setAddError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setAdding(false); }
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
          const isInstagram = acc.platform === 'instagram';
          const isTikTok = acc.platform === 'tiktok';

          return (
            <div
              key={acc.id}
              className="px-4 py-3 border-b transition-colors cursor-pointer hover:bg-[var(--color-surface-2)]"
              style={{ borderColor: 'var(--color-line)', background: acc.bot_active ? 'rgba(34, 197, 94,0.03)' : undefined }}
              onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectAccountForDetail && onSelectAccountForDetail(acc)}
              aria-label={`Cuenta ${acc.username}, abrir detalle y rampa`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Identity */}
                <div className="flex items-center gap-2.5">
                  {/* Platform icon */}
                  {isInstagram ? (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-sm">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                      </svg>
                    </div>
                  ) : isTikTok ? (
                    <div className="w-8 h-8 rounded-lg bg-black border border-slate-700/80 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.35a6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 10.82 4.48 6.3 6.3 0 0 0 1.86-4.48V8.6a8.28 8.28 0 0 0 5.08 1.73V6.89a4.82 4.82 0 0 1-2.17-.2z"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-muted)] shrink-0" title="Plataforma no informada">
                      <UserCircle size={18} aria-label="Plataforma no informada" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm font-mono text-white">
                        @{acc.username}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: 'var(--ref-blue)', background: '#102942' }}>Ver rampa</span>
                    </div>
                    <div className="text-[11px] font-mono mt-0.5 text-gray-400">
                      {acc.device_serial || 'Sin dispositivo'} · {acc.proxy_id || 'Sin proxy'}
                    </div>
                  </div>
                </div>

              </div>

              {/* Stats inline */}
              <div className="mt-2.5 pt-2 grid grid-cols-3 gap-2 text-[11px] font-mono border-t border-[var(--color-line)]">
                <div>
                  <span className="text-[#9aafc5]">Likes </span>
                  <strong className="text-white">{acc.likes_today || 0}</strong>
                </div>
                <div>
                  <span className="text-[#9aafc5]">Follows </span>
                  <strong className="text-white">{acc.follows_today || 0}</strong>
                </div>
                <div>
                  <span className="text-[#9aafc5]">Comms </span>
                  <strong className="text-[#ef4444] font-bold">{acc.comments_today || 0}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rendimiento (últimos 7 días) */}
      <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface-2)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-sans font-semibold text-white">Rendimiento (últimos 7 días)</span>
          <select className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-3)] border border-[var(--color-line)] text-[#9aafc5]">
            <option>Todas las cuentas</option>
          </select>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono mb-2">
          <span className="flex items-center gap-1 text-[#3b82f6]"><span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" /> Likes</span>
          <span className="flex items-center gap-1 text-[#a855f7]"><span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" /> Follows</span>
          <span className="flex items-center gap-1 text-[#22c55e]"><span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Comms</span>
        </div>
        <EngagementChart history={history} days={recentDays} />
        <div className="flex justify-between text-[9px] font-mono text-[#64748b] mt-1 pt-1 border-t border-[var(--color-line)]">
          {recentDays.map(day => <span key={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>)}
        </div>
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

              <p className="text-[11px]" style={{ color: 'var(--ref-muted)' }}>Se registra una ficha local. La cuenta social se crea en su aplicación oficial y se conectará mediante OAuth cuando esté disponible.</p>

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

              <p className="text-[11px]" style={{ color: 'var(--ref-muted)' }}>La rampa y sus pasos se configuran en el detalle de la cuenta. No hay cuotas automáticas por antigüedad.</p>
              {addError && <p role="alert" className="text-[11px] text-red-400">{addError}</p>}

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
                  disabled={adding}
                >
                  {adding ? 'Guardando…' : 'Guardar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
