import React from 'react';
import { Account, ProxyItem, SystemStats, AuthUser } from '../types';
import { Monitor, Cpu, HardDrive, ShieldCheck, Play, Activity, Code2, Terminal as TerminalIcon, Download, Smartphone, LogOut, UserCheck, Sparkles, GitBranch } from 'lucide-react';

interface HeaderProps {
  stats: SystemStats;
  accounts: Account[];
  proxies: ProxyItem[];
  currentUser: AuthUser | null;
  onOpenCodeViewer: () => void;
  onOpenCurlTester: () => void;
  onOpenAdbBridge: () => void;
  onOpenMoneyPrinter: () => void;
  onOpenVersionControl: () => void;
  onDownloadAllZip: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  accounts,
  proxies,
  currentUser,
  onOpenCodeViewer,
  onOpenCurlTester,
  onOpenAdbBridge,
  onOpenMoneyPrinter,
  onOpenVersionControl,
  onDownloadAllZip,
  onLogout,
}) => {
  const onlineProxiesCount = proxies.filter(p => p.status === 'online').length;

  return (
    <header className="h-16 border-b border-[#1E2C42] flex items-center justify-between px-6 bg-[#0B1220] text-neutral-200 select-none">
      {/* Brand & Badge matching TH3F4Rm3R */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onOpenVersionControl} title="Abrir Control de Versiones & History">
          <div className="w-6 h-6 rounded-lg bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-[#00E5BE] font-mono flex items-center gap-2">
            TH3F4Rm3R <span className="text-xs text-[#38BDF8] bg-[#0F1829] px-2 py-0.5 rounded border border-[#1E2C42] hover:border-[#00E5BE] flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-[#00E5BE]" /> v2.4 REAL
            </span>
          </h1>
        </div>

        {/* Top Nav Tabs from screenshot: Dashboard, AI Accounts, Emails, Social, Proxies, SMS, Jobs */}
        <div className="hidden md:flex items-center gap-1 bg-[#0F172A] p-1 rounded-lg border border-[#1E293B]">
          <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#1E293B] text-white flex items-center gap-1.5 shadow-sm">
            <Activity className="w-3.5 h-3.5 text-[#38BDF8]" /> Dashboard
          </button>
          <button onClick={onOpenMoneyPrinter} className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50 flex items-center gap-1.5 transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> MoneyPrinter
          </button>
          <button onClick={onOpenAdbBridge} className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50 flex items-center gap-1.5 transition-colors">
            <Smartphone className="w-3.5 h-3.5 text-[#00E5BE]" /> ADB Bridge
          </button>
          <button onClick={onOpenCurlTester} className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50 flex items-center gap-1.5 transition-colors">
            <TerminalIcon className="w-3.5 h-3.5 text-[#38BDF8]" /> cURL API
          </button>
          <button onClick={onOpenCodeViewer} className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50 flex items-center gap-1.5 transition-colors">
            <Code2 className="w-3.5 h-3.5 text-pink-400" /> Python Code
          </button>
          <button onClick={onOpenVersionControl} className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50 flex items-center gap-1.5 transition-colors">
            <GitBranch className="w-3.5 h-3.5 text-[#00E5BE]" /> Versiones
          </button>
        </div>
      </div>

      {/* Center System Metrics */}
      <div className="hidden lg:flex items-center text-xs font-mono gap-4 text-[#94A3B8]">
        <div className="flex items-center gap-2">
          <span className="text-[#64748B] text-[11px] uppercase tracking-wider">Panda Grid:</span>
          <span className="text-[#00E5BE] font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-pulse" /> {stats.panda_grid_status}
          </span>
        </div>

        <div className="flex items-center gap-2 border-l border-[#1E2C42] pl-4">
          <span className="text-[#64748B] text-[11px] uppercase tracking-wider">Proxies:</span>
          <span className="text-[#38BDF8] font-bold">{onlineProxiesCount}/{proxies.length} (35ms)</span>
        </div>

        <div className="flex items-center gap-2 border-l border-[#1E2C42] pl-4">
          <span className="text-[#64748B] text-[11px] uppercase tracking-wider">CPU/RAM:</span>
          <span className="text-white font-medium">{stats.cpu_percent}% / {stats.ram_percent}%</span>
        </div>
      </div>

      {/* Right Actions & Status Switch */}
      <div className="flex items-center gap-3">
        <div className="text-[11px] font-mono text-[#94A3B8] hidden sm:block">
          {new Date().toLocaleTimeString()} • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <button
          onClick={onDownloadAllZip}
          className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#38BDF8]/30 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all font-mono"
          title="Descargar paquete ZIP"
        >
          <Download className="w-3.5 h-3.5" /> ZIP
        </button>

        {/* Master ON/OFF Switch matching screenshot */}
        <div className="flex items-center gap-2 bg-[#0F172A] border border-[#1E293B] px-3 py-1 rounded-full text-xs font-mono">
          <span className="text-[#00E5BE] font-bold text-[10px]">ON</span>
          <div className="w-8 h-4 rounded-full bg-[#00E5BE] p-0.5 flex items-center justify-end">
            <div className="w-3 h-3 rounded-full bg-slate-950" />
          </div>
          <span className="text-[#64748B] font-bold text-[10px]">OFF</span>
        </div>

        {currentUser && (
          <button
            onClick={onLogout}
            className="p-1.5 text-[#94A3B8] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

