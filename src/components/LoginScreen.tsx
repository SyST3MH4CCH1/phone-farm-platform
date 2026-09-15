import React, { useState } from 'react';
import { AuthUser } from '../types';
import { apiFetch } from '../api';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          onLoginSuccess(data.user);
          return;
        }
      }

      const errData = await res.json().catch(() => ({}));
      setErrorMsg(errData.error || 'Usuario o contraseña incorrectos.');
    } catch (err) {
      setErrorMsg('Servidor no disponible. Verifica que el backend esté en ejecución.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text)] flex flex-col justify-between p-4 md:p-8 font-mono relative">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto z-10">
        <div className="flex items-center gap-3">
          {/* Logo SVG inline — letras PF estilizadas en matrix green */}
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="40" height="40" rx="6" fill="var(--color-surface-3)" />
            <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="var(--color-brand)" fontFamily="JetBrains Mono, monospace" fontWeight="700" fontSize="18">PF</text>
          </svg>
          <div>
            <h1 className="text-sm font-bold text-[var(--color-text)] tracking-widest uppercase flex items-center gap-2">
              Phone Farm Control Center <span className="text-[10px] bg-[var(--color-surface-3)] text-[var(--color-muted)] border border-[var(--color-line)] px-1.5 py-0.5 rounded-full font-mono">v2.4 REAL</span>
            </h1>
            <p className="text-[11px] text-[var(--color-muted)] font-sans">Sistema de Control de Dispositivos Android & ADB Automation</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-line)] px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-pulse" />
          <span>Servidor Node/Express: <strong className="text-[var(--color-text)]">http://127.0.0.1:3000</strong></span>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="max-w-md w-full mx-auto my-auto z-10 space-y-4">
        <div className="bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.12)] rounded-lg p-6 space-y-5 relative">
          <div className="space-y-1 text-center">
            <h2 className="text-base font-bold text-[var(--color-text)] uppercase tracking-wider">Acceso al Panel de Control</h2>
            <p className="text-xs text-[var(--color-muted)] font-sans">
              Autenticación requerida para operar la granja de smartphones ADB y bots taktik
            </p>
          </div>

          {errorMsg && (
            <div className="bg-[var(--color-surface-3)] border border-[var(--color-danger)]/30 rounded-lg p-3 text-[var(--color-danger)] text-xs flex items-center gap-2" role="alert">
              <span>{errorMsg}</span>
            </div>
          )}

          <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label htmlFor="login-username" className="block text-[var(--color-muted)] mb-1 font-semibold uppercase text-[10px]">
                Usuario Operador
              </label>
              <div className="relative">
                <input
                  id="login-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin u operador"
                  className="input w-full pl-9 pr-3 py-2"
                  aria-label="Nombre de usuario operador"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-[var(--color-muted)] mb-1 font-semibold uppercase text-[10px]">
                Contraseña de Seguridad
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full pl-9 pr-3 py-2"
                  aria-label="Contraseña de seguridad"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-brand w-full py-2.5 px-4 flex items-center justify-center gap-2 text-xs"
              aria-live="polite"
            >
              {loading ? (
                <span>Autenticando en Servidor...</span>
              ) : (
                <span>Iniciar Sesión en el Panel</span>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer — minimal, sin SSL/SSH marketing */}
      <footer className="max-w-6xl w-full mx-auto z-10 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-[var(--color-muted-2)] border-t border-[var(--color-line)] pt-4">
        <div>
          <span>Phone Farm Automation Control Center &copy; 2026</span>
        </div>
      </footer>
    </div>
  );
};
