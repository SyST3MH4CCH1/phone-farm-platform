import React from 'react';
import { Account, ProxyItem, SystemStats, AuthUser } from '../types';
import { Sparkles, Smartphone, Terminal as TerminalIcon, Code2, GitBranch, Download, LogOut, Power } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'moneyprinter' | 'adb' | 'panda' | 'curl' | 'code' | 'versions' | 'proxies' | 'schedule';

interface HeaderProps {
  stats: SystemStats;
  accounts: Account[];
  proxies: ProxyItem[];
  currentUser: AuthUser | null;
  deviceCount: number;
  onOpenPandaGrid: () => void;
  onOpenMoneyPrinter: () => void;
  onOpenAdbBridge: () => void;
  onOpenCurlTester: () => void;
  onOpenCodeViewer: () => void;
  onOpenVersionControl: () => void;
  onDownloadAllZip: () => void;
  onToggleMaster: () => void;
  onLogout: () => void;
  /** Legacy prop — dark-only, onToggleTheme removed */
  theme?: never;
  onToggleTheme?: never;
}

/** Barra superior del panel — pestañas de acceso rápido + métricas en vivo. */
export const Header: React.FC<HeaderProps> = ({
  stats,
  accounts,
  proxies,
  currentUser,
  deviceCount,
  onOpenPandaGrid,
  onOpenMoneyPrinter,
  onOpenAdbBridge,
  onOpenCurlTester,
  onOpenCodeViewer,
  onOpenVersionControl,
  onDownloadAllZip,
  onToggleMaster,
  onLogout,
}) => {
  const onlineProxies = proxies.filter(p => p.status === 'online').length;
  const botsActive = (stats.active_bots || 0) > 0;

  return (
    <header
      className="h-11 border-b flex items-center justify-between px-4 text-[13px] font-mono select-none"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <div className="flex items-center gap-4">
        {/* Logo PF + nombre */}
        <span className="font-bold tracking-wide" style={{ color: 'var(--color-text)' }}>PF</span>
        <span className="hidden md:inline text-[11px]" style={{ color: 'var(--color-muted-2)' }}>Phone Farm</span>
      </div>

      {/* Pestañas de acceso rápido */}
      <nav className="hidden md:flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
        <button
          onClick={onOpenMoneyPrinter}
          className="px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface-3)]"
          title="Generador MoneyPrinterTurbo"
          style={{ color: 'var(--color-muted)' }}
        >
          <Sparkles size={16} />
          <span>MoneyPrinter</span>
        </button>
        <button
          onClick={onOpenAdbBridge}
          className="px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface-3)]"
          title="Bridge ADB"
          style={{ color: 'var(--color-muted)' }}
        >
          <Smartphone size={16} />
          <span>ADB Bridge</span>
        </button>
        <button
          onClick={onOpenCurlTester}
          className="px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface-3)]"
          title="Probador de API cURL"
          style={{ color: 'var(--color-muted)' }}
        >
          <TerminalIcon size={16} />
          <span>cURL API</span>
        </button>
        <button
          onClick={onOpenCodeViewer}
          className="px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface-3)]"
          title="Código fuente del backend"
          style={{ color: 'var(--color-muted)' }}
        >
          <Code2 size={16} />
          <span>Python Code</span>
        </button>
        <button
          onClick={onOpenVersionControl}
          className="px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface-3)]"
          title="Control de versiones"
          style={{ color: 'var(--color-muted)' }}
        >
          <GitBranch size={16} />
          <span>Versiones</span>
        </button>
      </nav>

      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--color-muted)' }}>
        {/* Panda */}
        <button
          onClick={onOpenPandaGrid}
          className="hover:bg-[var(--color-surface-3)] px-2 py-1 rounded-md transition-colors"
          title="Abrir Panda (pantallas en vivo) en otra ventana"
        >
          Panda: <span style={{ color: deviceCount > 0 ? 'var(--color-text)' : 'var(--color-muted-2)' }}>{deviceCount > 0 ? `${deviceCount} conectado${deviceCount !== 1 ? 's' : ''}` : 'sin dispositivos'}</span>
        </button>

        {/* Bots + Master Toggle */}
        <span className="flex items-center gap-1">
          Bots: <span style={{ color: botsActive ? 'var(--color-ok)' : 'var(--color-muted-2)' }}>{stats.active_bots || 0} activo{(stats.active_bots || 0) !== 1 ? 's' : ''}</span>
          {/* Real switch */}
          <button
            onClick={onToggleMaster}
            className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
            style={{
              background: botsActive ? 'var(--color-danger)' : 'var(--color-ok)',
              color: '#0A0A0B',
            }}
            title={botsActive ? 'Detener todos los bots' : 'Iniciar bots taktik'}
          >
            <Power size={12} />
            <span className="text-[10px] font-bold">{botsActive ? 'OFF' : 'ON'}</span>
          </button>
        </span>

        {/* Proxies */}
        <span className="hidden lg:inline">
          Proxies: <span style={{ color: 'var(--color-text)' }}>{onlineProxies}/{proxies.length}</span>
        </span>

        {/* CPU/RAM */}
        <span className="hidden xl:inline font-mono tabular-nums">
          CPU/RAM: <span style={{ color: 'var(--color-text)' }}>{stats.cpu_percent}% / {stats.ram_percent}%</span>
        </span>

        {/* ZIP button */}
        <button
          onClick={onDownloadAllZip}
          className="btn-brand px-2 py-0.5 text-[10px] flex items-center gap-1"
          title="Descargar configuración ZIP"
        >
          <Download size={12} />
          <span>ZIP</span>
        </button>

        {/* Date */}
        <span className="hidden sm:inline" style={{ color: 'var(--color-muted-2)' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>

        {/* Logout como icono */}
        {currentUser && (
          <button
            onClick={onLogout}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-3)] transition-colors"
            style={{ color: 'var(--color-muted)' }}
            title={`${currentUser.username} — cerrar sesión`}
            aria-label={`Cerrar sesión de ${currentUser.username}`}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
};
