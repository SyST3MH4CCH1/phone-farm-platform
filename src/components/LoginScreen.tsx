import React, { useState } from 'react';
import { Smartphone, Lock, User, Key, ShieldCheck, Cpu, Terminal, Sparkles, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
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

  const handleQuickLogin = (userRole: 'admin' | 'operator') => {
    if (userRole === 'admin') {
      setUsername('admin');
      setPassword('admin123');
    } else {
      setUsername('operator');
      setPassword('operator123');
    }
  };

  return (
    <div className="min-h-screen bg-[#070708] text-neutral-200 flex flex-col justify-between p-4 md:p-8 font-mono relative overflow-hidden">
      {/* Ambient background grid & lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,229,190,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00E5BE]/30 to-transparent pointer-events-none" />

      {/* Top Header */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00E5BE]/10 border border-[#00E5BE]/30 rounded-xl flex items-center justify-center text-[#00E5BE] shadow-lg">
            <Smartphone className="w-5 h-5 text-[#00E5BE]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-widest uppercase flex items-center gap-2">
              Phone Farm Control Center <span className="text-[10px] bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30 px-1.5 py-0.5 rounded-full font-mono">v2.4 REAL</span>
            </h1>
            <p className="text-[11px] text-[#94A3B8] font-sans">Sistema de Control de Dispositivos Android & ADB Automation</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#94A3B8] bg-[#101A2D] border border-[#1E2C42] px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-pulse" />
          <span>Servidor Node/Express: <strong className="text-white">http://0.0.0.0:3000</strong></span>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="max-w-md w-full mx-auto my-auto z-10 space-y-4">
        <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl p-6 shadow-2xl space-y-5 relative">
          <div className="space-y-1 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#00E5BE]/10 rounded-full border border-[#00E5BE]/30 text-[#00E5BE] mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-white uppercase tracking-wider">Acceso al Panel de Control</h2>
            <p className="text-xs text-[#94A3B8] font-sans">
              Autenticación requerida para operar la granja de smartphones ADB y bots taktik
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-3 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-[#94A3B8] mb-1 font-semibold uppercase text-[10px]">
                Usuario Operador
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin u operador"
                  className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#00E5BE] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#94A3B8] mb-1 font-semibold uppercase text-[10px]">
                Contraseña de Seguridad
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0B1320] border border-[#1E2C42] rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#00E5BE] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-xs shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <span>Autenticando en Servidor...</span>
              ) : (
                <>
                  <span>Iniciar Sesión en el Panel</span>
                  <ArrowRight className="w-4 h-4 text-[#090D16]" />
                </>
              )}
            </button>
          </form>

          {/* Preset Demo Logins */}
          <div className="pt-3 border-t border-[#1E2C42] space-y-2">
            <span className="block text-[10px] uppercase text-[#64748B] text-center tracking-wider">
              Acceso Rápido de Demostración:
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                className="bg-[#0B1320] hover:bg-[#1E293B] border border-[#1E2C42] rounded-lg px-3 py-2 text-left flex flex-col transition-colors"
              >
                <span className="text-white font-bold flex items-center justify-between">
                  Admin Master <ShieldCheck className="w-3 h-3 text-[#00E5BE]" />
                </span>
                <span className="text-[10px] text-[#64748B]">admin / admin123</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('operator')}
                className="bg-[#0B1320] hover:bg-[#1E293B] border border-[#1E2C42] rounded-lg px-3 py-2 text-left flex flex-col transition-colors"
              >
                <span className="text-white font-bold flex items-center justify-between">
                  Técnico ADB <Cpu className="w-3 h-3 text-[#4DFFE0]" />
                </span>
                <span className="text-[10px] text-[#64748B]">operator / operator123</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl w-full mx-auto z-10 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-[#64748B] border-t border-[#1E2C42] pt-4">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#00E5BE]" /> SSL / SSH Security Protocol Active</span>
          <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-[#4DFFE0]" /> Express REST API Session Engine</span>
        </div>
        <div>
          <span>Phone Farm Automation Control Center &copy; 2026</span>
        </div>
      </footer>
    </div>
  );
};
