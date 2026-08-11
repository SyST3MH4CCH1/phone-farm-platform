import React from 'react';
import { Account, ProxyItem, SystemStats, AuthUser } from '../types';
import { Sparkles, Smartphone, Terminal as TerminalIcon, Code2, GitBranch, Download } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'moneyprinter' | 'adb' | 'panda' | 'curl' | 'code' | 'versions' | 'proxies' | 'schedule';

interface HeaderProps {
  stats: SystemStats;
  accounts: Account[];
  proxies: ProxyItem[];
  currentUser: AuthUser | null;
  theme: 'dark' | 'light';
  deviceCount: number;
  onOpenPandaGrid: () => void;
  onOpenMoneyPrinter: () => void;
  onOpenAdbBridge: () => void;
  onOpenCurlTester: () => void;
  onOpenCodeViewer: () => void;
  onOpenVersionControl: () => void;
  onDownloadAllZip: () => void;
  onToggleMaster: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

/** Barra superior del panel — pestañas de acceso rápido + métricas en vivo. */
export const Header: React.FC<HeaderProps> = ({
  stats,
  accounts,
  proxies,
  currentUser,
  theme,
  deviceCount,
  onOpenPandaGrid,
  onOpenMoneyPrinter,
  onOpenAdbBridge,
  onOpenCurlTester,
  onOpenCodeViewer,
  onOpenVersionControl,
  onDownloadAllZip,
  onToggleMaster,
  onToggleTheme,
  onLogout,
}) => {
  const onlineProxies = proxies.filter(p => p.status === 'online').length;
  const botsActive = (stats.active_bots || 0) > 0;

  return (
    <header
      className="h-11 border-b flex items-center justify-between px-4 text-[13px] font-mono select-none"
      style={{ background: 'var(--color-header-bg)', borderColor: 'var(--color-header-border)' }}
    >
      <div className="flex items-center gap-4">
        <span className="font-bold tracking-wide" style={{ color: 'var(--color-header-text)' }}>Phone Farm</span>
        <span className="hidden md:inline text-[11px]" style={{ color: 'var(--color-header-muted2)' }}>Panel de Control — Mini PC</span>
      </div>

      {/* Pestañas de acceso rápido (restauradas 2026-08-10) */}
      <nav className="hidden md:flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-header-muted)' }}>
        <button onClick={onOpenMoneyPrinter} className="px-2.5 py-1 rounded-md hover:underline transition-colors" title="Generador MoneyPrinterTurbo" style={{ color: 'var(--color-header-muted)' }}>
          <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> MoneyPrinter</span>
        </button>
        <button onClick={onOpenAdbBridge} className="px-2.5 py-1 rounded-md hover:underline transition-colors" title="Bridge ADB" style={{ color: 'var(--color-header-muted)' }}>
          <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> ADB Bridge</span>
        </button>
        <button onClick={onOpenCurlTester} className="px-2.5 py-1 rounded-md hover:underline transition-colors" title="Probador de API cURL" style={{ color: 'var(--color-header-muted)' }}>
          <span className="flex items-center gap-1.5"><TerminalIcon className="w-3.5 h-3.5" /> cURL API</span>
        </button>
        <button onClick={onOpenCodeViewer} className="px-2.5 py-1 rounded-md hover:underline transition-colors" title="Código fuente del backend" style={{ color: 'var(--color-header-muted)' }}>
          <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> Python Code</span>
        </button>
        <button onClick={onOpenVersionControl} className="px-2.5 py-1 rounded-md hover:underline transition-colors" title="Control de versiones" style={{ color: 'var(--color-header-muted)' }}>
          <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Versiones</span>
        </button>
      </nav>

      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--color-header-muted)' }}>
        <button onClick={onOpenPandaGrid} className="hover:underline transition-colors" title="Abrir Panda (pantallas en vivo) en otra ventana" style={{ color: 'var(--color-header-muted)' }}>
          Panda: <span style={{ color: deviceCount > 0 ? 'var(--color-header-text)' : 'var(--color-header-muted2)' }}>{deviceCount > 0 ? `${deviceCount} conectado${deviceCount !== 1 ? 's' : ''}` : 'sin dispositivos'}</span>
        </button>
        <span>
          Bots: <span className={botsActive ? 'text-[#6FBF73]' : ''} style={{ color: botsActive ? '#6FBF73' : 'var(--color-header-muted2)' }}>{stats.active_bots || 0} activo{(stats.active_bots || 0) !== 1 ? 's' : ''}</span>
          {botsActive ? (
            <button onClick={onToggleMaster} className="ml-2 text-[#E05B5B] hover:underline" title="Detener todos los bots">[detener]</button>
          ) : (
            <button onClick={onToggleMaster} className="ml-2 text-[#6FBF73] hover:underline" title="Iniciar bots taktik">[iniciar]</button>
          )}
        </span>
        <span className="hidden lg:inline">
          Proxies: <span style={{ color: 'var(--color-header-text)' }}>{onlineProxies}/{proxies.length}</span>
        </span>
        <span className="hidden xl:inline">
          CPU/RAM: <span style={{ color: 'var(--color-header-text)' }}>{stats.cpu_percent}% / {stats.ram_percent}%</span>
        </span>
        <button
          onClick={onDownloadAllZip}
          className="px-2 py-0.5 rounded border font-bold transition-colors"
          style={{ borderColor: 'var(--color-header-border)', color: 'var(--color-header-text)' }}
          title="Descargar configuración ZIP"
        >
          <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" /> ZIP</span>
        </button>
        <span className="hidden sm:inline" style={{ color: 'var(--color-header-muted2)' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button onClick={onToggleTheme} className="hover:underline transition-colors" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} style={{ color: 'var(--color-header-muted)' }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        {currentUser && (
          <button onClick={onLogout} className="hover:text-[#E05B5B] transition-colors" style={{ color: 'var(--color-header-muted)' }} title="Cerrar sesión">
            {currentUser.username} [salir]
          </button>
        )}
      </div>
    </header>
  );
};
