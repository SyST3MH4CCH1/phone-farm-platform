import React, { useState } from 'react';
import { Account, ProxyItem } from '../types';
import { Flame } from 'lucide-react';

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
    if (day <= 7) return { limit: 30, color: 'text-[#A1A6AE] bg-[#A1A6AE]/10 border-[#A1A6AE]/30' };
    if (day <= 14) return { limit: 50, color: 'text-[#9CA1A8] bg-[#232528] border-[#2A2C30]' };
    return { limit: 100, color: 'text-[#8A8F98] bg-[#8A8F98]/10 border-[#8A8F98]/30' };
  };

  return (
    <div className="bg-[#1E2023] border border-[#2A2C30] rounded-xl flex flex-col h-full overflow-hidden">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-[#2A2C30] flex items-center justify-between bg-[#232528]">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-[#E5E5E5] uppercase tracking-wider font-mono">
            Cuentas & ADB Dispositivos <span className="text-[#8A8F98]">({accounts.length})</span>
          </h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#8A8F98]/10 hover:bg-[#8A8F98]/20 text-[#8A8F98] border border-[#8A8F98]/30 font-bold text-xs px-3 py-1 rounded-lg flex items-center gap-1 transition-all font-mono"
        > Nueva Cuenta
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
              className={`bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-3.5 transition-all hover:border-[#A1A6AE]/40 ${
                acc.bot_active ? 'border-[#8A8F98]/40 bg-[#8A8F98]/5' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className="cursor-pointer group flex-1"
                  onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#E5E5E5] font-mono group-hover:text-[#8A8F98] transition-colors">
                      @{acc.username}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full font-mono ${warmupInfo.color}`}>
                      Día {acc.warmup_day} ({warmupInfo.limit} acc/día)
                    </span>
                  </div>
                  <div className="text-xs text-[#9CA1A8] mt-1.5 space-y-1 font-mono">
                    <div className="flex items-center gap-1.5"> Serial: <span className="text-[#E5E5E5]">{acc.device_serial}</span>
                    </div>
                    <div className="flex items-center gap-1.5"> Proxy: <span className="text-[#A1A6AE]">{acc.proxy_id}</span> <span className="text-[#6B7076]">({proxy ? (proxy.ip || 'sin verificar') : 'no asignado'})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                    className="text-[10px] bg-[#33363A] hover:bg-[#3A3D42] text-[#A1A6AE] border border-[#A1A6AE]/30 px-2 py-1 rounded-lg font-mono font-bold"
                    title="Consultar datos completos de la cuenta"
                  >
                    Datos
                  </button>
                  <button
                    onClick={() => onDeleteAccount(acc.id)}
                    className="text-[10px] hover:text-[#E05B5B] text-[#6B7076] transition-colors px-2 py-1 rounded-lg font-mono font-bold border border-transparent hover:border-[#E05B5B]/40"
                    title="Eliminar cuenta"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Bot Activity Stats */}
              <div
                onClick={() => onSelectAccountForDetail && onSelectAccountForDetail(acc)}
                className="mt-3 pt-2 border-t border-[#2A2C30] grid grid-cols-3 gap-1 text-[11px] text-[#9CA1A8] font-mono bg-[#232528] p-2 rounded-lg cursor-pointer"
              >
                <div>Likes: <strong className="text-[#8A8F98] font-bold">{acc.likes_today || 0}</strong></div>
                <div>Follows: <strong className="text-[#A1A6AE] font-bold">{acc.follows_today || 0}</strong></div>
                <div>Comms: <strong className="text-pink-400 font-bold">{acc.comments_today || 0}</strong></div>
              </div>

              {/* Bot Control Button */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-[#9CA1A8] font-mono flex items-center gap-1.5">
                  <Flame className={`w-3.5 h-3.5 ${acc.bot_active ? 'text-[#8A8F98] animate-pulse' : 'text-[#6B7076]'}`} />
                  {acc.bot_active ? <span className="text-[#8A8F98] font-semibold">taktik-bot corriendo</span> : <span className="text-[#6B7076]">Bot inactivo</span>}
                </span>

                <button
                  onClick={() => onToggleBot(acc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border ${
                    acc.bot_active
                      ? 'bg-[#232528] hover:bg-[#2A2C30] border-[#2A2C30] text-[#E05B5B]'
                      : 'bg-[#8A8F98]/10 hover:bg-[#8A8F98]/20 border-[#8A8F98]/30 text-[#8A8F98]'
                  }`}
                >
                  {acc.bot_active ? (
                    <> Detener Bot
                    </>
                  ) : (
                    <> Iniciar Bot
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E2023] border border-[#2A2C30] rounded-xl p-5 w-full max-w-md">
            <h3 className="text-sm font-bold text-[#E5E5E5] mb-4 uppercase tracking-wider font-mono flex items-center gap-2 border-b border-[#2A2C30] pb-3"> Registrar Nueva Cuenta IG
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 font-mono">
              <div>
                <label className="block text-xs text-[#9CA1A8] mb-1 uppercase tracking-wide">Username de Instagram</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ej. nicho_recetas_saludables"
                  className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-3 py-2 text-xs text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#9CA1A8] mb-1 uppercase tracking-wide">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password123!"
                  className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-3 py-2 text-xs text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[#9CA1A8] mb-1 uppercase tracking-wide">ADB Device Serial</label>
                  <input
                    type="text"
                    required
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-3 py-2 text-xs text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA1A8] mb-1 uppercase tracking-wide">Proxy Asignado</label>
                  <select
                    value={newProxyId}
                    onChange={(e) => setNewProxyId(e.target.value)}
                    className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-3 py-2 text-xs text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98]"
                  >
                    {proxies.map((p) => (
                      <option key={p.id} value={p.id}>{p.id} ({p.provider})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#9CA1A8] mb-1 uppercase tracking-wide">Día de Warmup Actual (1 a 30)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={newWarmupDay}
                  onChange={(e) => setNewWarmupDay(Number(e.target.value))}
                  className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-3 py-2 text-xs text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98]"
                />
                <p className="text-[10px] text-[#6B7076] mt-1">
                  Días ≤7 = Max 30 acc/día | 8-14 = 50 | &gt;14 = 100
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#2A2C30]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[#9CA1A8] hover:text-[#E5E5E5] border border-[#2A2C30] bg-[#1A1C1E]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold rounded-lg text-xs font-mono"
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
