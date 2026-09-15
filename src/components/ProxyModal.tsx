import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { ProxyItem } from '../types';

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
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="modal-shell w-full max-w-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="modal-header px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
            Gestión de Proxies SOCKS5 — DataImpulse
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="btn-close">✕</button>
        </div>

        {/* Proxy List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          {proxies.map((p) => (
            <div
              key={p.id}
              className="p-3 flex items-center justify-between text-[11px] font-mono"
              style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)', borderRadius: '6px' }}
            >
              <div>
                <div className="flex items-center gap-2 font-bold" style={{ color: 'var(--color-text)' }}>
                  {p.id} ({p.provider}) — <span style={{ color: 'var(--color-muted)' }}>{p.type.toUpperCase()}</span>
                </div>
                <div className="mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  Host: {p.host}:{p.port} | Auth: {p.user ? `${p.user.slice(0, 6)}***` : 'No auth'}
                </div>
                {p.ip && (
                  <div className="mt-1" style={{ color: 'var(--color-muted)' }}>
                    IP Actual: <strong style={{ color: 'var(--color-info)' }}>{p.ip}</strong> | Latencia: {p.latency_ms}ms
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="status-pill"
                  style={{
                    color: p.status === 'online' ? 'var(--color-ok)' : 'var(--color-danger)',
                    background: p.status === 'online' ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,92,0.1)',
                    border: `1px solid ${p.status === 'online' ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,92,0.2)'}`,
                  }}
                >
                  <span
                    className="dot"
                    style={{ background: p.status === 'online' ? 'var(--color-ok)' : 'var(--color-danger)' }}
                  />
                  {p.status.toUpperCase()}
                </span>
                <button
                  onClick={() => onVerifyProxy(p.id)}
                  className="btn-secondary text-[10px] px-2.5 py-1 flex items-center gap-1"
                >
                  Test IP
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Proxy Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3" style={{ borderTop: '1px solid var(--color-line)' }}>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <label htmlFor="proxy-host" className="block mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Host SOCKS5</label>
              <input
                id="proxy-host"
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="input w-full px-2.5 py-1.5"
              />
            </div>
            <div>
              <label htmlFor="proxy-port" className="block mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Puerto</label>
              <input
                id="proxy-port"
                type="number"
                required
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input w-full px-2.5 py-1.5"
              />
            </div>
            <div>
              <label htmlFor="proxy-user" className="block mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>User Token</label>
              <input
                id="proxy-user"
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="user_token_abc"
                className="input w-full px-2.5 py-1.5"
              />
            </div>
            <div>
              <label htmlFor="proxy-pass" className="block mb-1 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Pass Token</label>
              <input
                id="proxy-pass"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="pass_token_123"
                className="input w-full px-2.5 py-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-brand px-4 py-1.5 flex items-center gap-1"
            >
              Agregar Proxy
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
