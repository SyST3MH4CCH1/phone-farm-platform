import React, { useState } from 'react';
import { Account, ProxyItem } from '../types';
import { Smartphone, Play, Pause, Square, Plus, ShieldCheck, Flame, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';

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

  const getWarmupLimit = (day: number) => {
    if (day <= 7) return { limit: 30, color: 'text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/30' };
    if (day <= 14) return { limit: 50, color: 'text-cyan-300 bg-cyan-950/40 border-cyan-800/40' };
    return { limit: 100, color: 'text-[#00E5BE] bg-[#00E5BE]/10 border-[#00E5BE]/30' };
  };

  return (
    <div className="bg-[#101A2D] border border-[#1E2C42] rounded-xl flex flex-col h-full overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-[#1E2C42] flex items-center justify-between bg-[#0F1829]">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[#00E5BE]" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Cuentas & ADB Dispositivos <span className="text-[#00E5BE]">({accounts.length})</span>
          </h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#00E5BE]/10 hover:bg-[#00E5BE]/20 text-[#00E5BE] border border-[#00E5BE]/30 font-bold text-xs px-3 py-1 rounded-lg flex items-center gap-1 transition-all font-mono shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva Cuenta
        </button>
      </div>

      {/* Account Cards Container */}
      <div className="p-3 flex-1 overflow-y-auto space-y-3">
        {accounts.map((acc) => {
          const proxy = proxies.find(p => p.id === acc.proxy_id);
          const warmupInfo = getWarmupLimit(acc.warmup_day);

          return (
            <div
              key={acc.id}
              className={`bg-[#0B1320] border border-[#1E2C42] rounded-xl p-3.5 transition-all hover:border-[#38BDF8]/40 ${
                acc.bot_active ? 'border-[#00E5BE]/40 bg-[#00E5BE]/5' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className="cursor-pointer group flex-1"
                  onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white font-mono group-hover:text-[#00E5BE] transition-colors">
                      @{acc.username}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full font-mono ${warmupInfo.color}`}>
                      Día {acc.warmup_day} ({warmupInfo.limit} acc/día)
                    </span>
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1.5 space-y-1 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="w-3 h-3 text-[#38BDF8]" /> Serial: <span className="text-white">{acc.device_serial}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-[#00E5BE]" /> Proxy: <span className="text-[#38BDF8]">{acc.proxy_id}</span> <span className="text-[#64748B]">({proxy ? proxy.ip : 'DataImpulse SOCKS5'})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                    className="text-[10px] bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#38BDF8]/30 px-2 py-1 rounded-lg font-mono font-bold"
                    title="Consultar datos completos de la cuenta"
                  >
                    Datos
                  </button>
                  <button
                    onClick={() => onDeleteAccount(acc.id)}
                    className="text-[#64748B] hover:text-red-400 transition-colors p-1"
                    title="Eliminar cuenta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bot Activity Stats */}
              <div
                onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                className="mt-3 pt-2 border-t border-[#1E2C42] grid grid-cols-3 gap-1 text-[11px] text-[#94A3B8] font-mono bg-[#0F172A] p-2 rounded-lg cursor-pointer"
              >
                <div>Likes: <strong className="text-[#00E5BE] font-bold">{acc.likes_today || 0}</strong></div>
                <div>Follows: <strong className="text-[#38BDF8] font-bold">{acc.follows_today || 0}</strong></div>
                <div>Comms: <strong className="text-pink-400 font-bold">{acc.comments_today || 0}</strong></div>
              </div>

              {/* Bot Control Button */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-[#94A3B8] font-mono flex items-center gap-1.5">
                  <Flame className={`w-3.5 h-3.5 ${acc.bot_active ? 'text-[#00E5BE] animate-pulse' : 'text-[#64748B]'}`} />
                  {acc.bot_active ? <span className="text-[#00E5BE] font-semibold">taktik-bot corriendo</span> : <span className="text-[#64748B]">Bot inactivo</span>}
                </span>

                <button
                  onClick={() => onToggleBot(acc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border ${
                    acc.bot_active
                      ? 'bg-red-950/40 hover:bg-red-900/60 border-red-500/40 text-red-300'
                      : 'bg-[#00E5BE]/10 hover:bg-[#00E5BE]/20 border-[#00E5BE]/30 text-[#00E5BE]'
                  }`}
                >
                  {acc.bot_active ? (
                    <>
                      <Pause className="w-3 h-3 text-red-400" /> Detener Bot
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 text-[#00E5BE]" /> Iniciar Bot
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101A2D] border border-[#1E2C42] rounded-xl p-5 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider font-mono flex items-center gap-2 border-b border-[#1E2C42] pb-3">
              <Plus className="w-4 h-4 text-[#00E5BE]" /> Registrar Nueva Cuenta IG
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 font-mono">
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">Username de Instagram</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ej. nicho_recetas_saludables"
                  className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password123!"
                  className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">ADB Device Serial</label>
                  <input
                    type="text"
                    required
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">Proxy Asignado</label>
                  <select
                    value={newProxyId}
                    onChange={(e) => setNewProxyId(e.target.value)}
                    className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE]"
                  >
                    {proxies.map((p) => (
                      <option key={p.id} value={p.id}>{p.id} ({p.provider})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">Día de Warmup Actual (1 a 30)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={newWarmupDay}
                  onChange={(e) => setNewWarmupDay(Number(e.target.value))}
                  className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE]"
                />
                <p className="text-[10px] text-[#64748B] mt-1">
                  Días ≤7 = Max 30 acc/día | 8-14 = 50 | &gt;14 = 100
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2C42]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-white border border-[#1E2C42] bg-[#0B1320]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold rounded-lg text-xs shadow-sm font-mono"
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
