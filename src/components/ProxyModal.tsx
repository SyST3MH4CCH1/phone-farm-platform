import React, { useState } from 'react';
import { ProxyItem } from '../types';
import { ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, Plus, HardDrive } from 'lucide-react';

interface ProxyModalProps {
  isOpen: boolean;
  onClose: () => void;
  proxies: ProxyItem[];
  onAddProxy: (proxy: Partial<ProxyItem>) => void;
  onVerifyProxy: (proxyId: string) => void;
}

export const ProxyModal: React.FC<ProxyModalProps> = ({
  isOpen,
  onClose,
  proxies,
  onAddProxy,
  onVerifyProxy
}) => {
  const [host, setHost] = useState('gw.dataimpulse.com');
  const [port, setPort] = useState(10003);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [provider, setProvider] = useState('DataImpulse');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddProxy({
      provider,
      type: 'socks5',
      host,
      port: Number(port),
      user,
      pass,
      status: 'online'
    });
    setUser('');
    setPass('');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2C42]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#00E5BE]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gestión de Proxies SOCKS5 Residenciales (DataImpulse)</h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white text-sm p-1">✕</button>
        </div>

        {/* Proxy List */}
        <div className="my-4 flex-1 overflow-y-auto space-y-2">
          {proxies.map((p) => (
            <div key={p.id} className="bg-[#0B1320] border border-[#1E2C42] rounded-xl p-3 flex items-center justify-between text-xs">
              <div>
                <div className="flex items-center gap-2 font-bold text-white">
                  {p.id} ({p.provider}) — <span className="text-[#38BDF8] font-semibold">{p.type.toUpperCase()}</span>
                </div>
                <div className="text-[#94A3B8] text-[11px] mt-0.5">
                  Host: {p.host}:{p.port} | Auth: {p.user ? `${p.user.slice(0, 6)}***` : 'No auth'}
                </div>
                {p.ip && (
                  <div className="text-[#94A3B8] text-[11px] mt-1">
                    IP Pública Actual: <strong className="text-[#00E5BE] font-bold">{p.ip}</strong> | Latencia: {p.latency_ms}ms
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  p.status === 'online' ? 'bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30' : 'bg-red-950/60 text-red-400 border border-red-500/40'
                }`}>
                  {p.status.toUpperCase()}
                </span>
                <button
                  onClick={() => onVerifyProxy(p.id)}
                  className="bg-[#1E293B] hover:bg-[#334155] text-[#00E5BE] border border-[#38BDF8]/30 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-[#00E5BE]" /> Test IP
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Proxy Form */}
        <form onSubmit={handleSubmit} className="border-t border-[#1E2C42] pt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[#94A3B8] mb-1 uppercase tracking-wide">Host SOCKS5</label>
            <input
              type="text"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00E5BE]"
            />
          </div>
          <div>
            <label className="block text-[#94A3B8] mb-1 uppercase tracking-wide">Puerto</label>
            <input
              type="number"
              required
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00E5BE]"
            />
          </div>
          <div>
            <label className="block text-[#94A3B8] mb-1 uppercase tracking-wide">User Token</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="user_token_abc"
              className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00E5BE]"
            />
          </div>
          <div>
            <label className="block text-[#94A3B8] mb-1 uppercase tracking-wide">Pass Token</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="pass_token_123"
              className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00E5BE]"
            />
          </div>

          <div className="col-span-2 flex justify-end gap-2 mt-2">
            <button
              type="submit"
              className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold px-4 py-1.5 rounded-lg text-xs shadow-sm flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Proxy SOCKS5
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
