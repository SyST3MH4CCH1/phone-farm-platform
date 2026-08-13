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
      // Sin servidor disponible: no se permite autenticación local (ver docs/AUDIT.md §2.4)
      setErrorMsg('Servidor no disponible. Verifica que el backend esté en ejecución.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#17181A] text-[#E5E5E5] flex flex-col justify-between p-4 md:p-8 font-mono relative overflow-hidden">
      {/* Ambient background grid & lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,229,190,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8A8F98]/30 to-transparent pointer-events-none" />

      {/* Top Header */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#8A8F98]/10 border border-[#8A8F98]/30 rounded-xl flex items-center justify-center text-[#8A8F98]">
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#E5E5E5] tracking-widest uppercase flex items-center gap-2">
              Phone Farm Control Center <span className="text-[10px] bg-[#8A8F98]/10 text-[#8A8F98] border border-[#8A8F98]/30 px-1.5 py-0.5 rounded-full font-mono">v2.4 REAL</span>
            </h1>
            <p className="text-[11px] text-[#9CA1A8] font-sans">Sistema de Control de Dispositivos Android & ADB Automation</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#9CA1A8] bg-[#1E2023] border border-[#2A2C30] px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-[#8A8F98] animate-pulse" />
          <span>Servidor Node/Express: <strong className="text-[#E5E5E5]">http://127.0.0.1:3000</strong></span>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="max-w-md w-full mx-auto my-auto z-10 space-y-4">
        <div className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl p-6 space-y-5 relative">
          <div className="space-y-1 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#8A8F98]/10 rounded-full border border-[#8A8F98]/30 text-[#8A8F98] mb-2">
            </div>
            <h2 className="text-base font-bold text-[#E5E5E5] uppercase tracking-wider">Acceso al Panel de Control</h2>
            <p className="text-xs text-[#9CA1A8] font-sans">
              Autenticación requerida para operar la granja de smartphones ADB y bots taktik
            </p>
          </div>

          {errorMsg && (
            <div className="bg-[#232528] border border-[#2A2C30] rounded-lg p-3 text-[#E05B5B] text-xs flex items-center gap-2">
              <span>{errorMsg}</span>
            </div>
          )}

          <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-[#9CA1A8] mb-1 font-semibold uppercase text-[10px]">
                Usuario Operador
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin u operador"
                  className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg pl-9 pr-3 py-2 text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#9CA1A8] mb-1 font-semibold uppercase text-[10px]">
                Contraseña de Seguridad
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1A1C1E] border border-[#2A2C30] rounded-lg pl-9 pr-3 py-2 text-[#E5E5E5] focus:outline-none focus:border-[#8A8F98] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50"
            >
              {loading ? (
                <span>Autenticando en Servidor...</span>
              ) : (
                <>
                  <span>Iniciar Sesión en el Panel</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl w-full mx-auto z-10 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-[#6B7076] border-t border-[#2A2C30] pt-4">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"> SSL / SSH Security Protocol Active</span>
          <span className="flex items-center gap-1.5"> Express REST API Session Engine</span>
        </div>
        <div>
          <span>Phone Farm Automation Control Center &copy; 2026</span>
        </div>
      </footer>
    </div>
  );
};
