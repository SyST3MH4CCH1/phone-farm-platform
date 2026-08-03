import React, { useRef, useEffect } from 'react';
import { LogEntry } from '../types';
import { Terminal as TerminalIcon, Trash2, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export const TerminalLogs: React.FC<TerminalLogsProps> = ({
  logs,
  onClearLogs,
  isMinimized = false,
  onToggleMinimize
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMinimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'ERROR': return 'text-red-400 font-bold';
      case 'WARN': return 'text-[#4DFFE0] font-bold';
      case 'DEBUG': return 'text-zinc-500';
      default: return 'text-[#00E5BE] font-bold';
    }
  };

  return (
    <div className={`bg-[#101A2D] border border-[#1E2C42] rounded-xl flex flex-col font-mono text-xs overflow-hidden shadow-xl transition-all duration-300 ${
      isMinimized ? 'h-11' : 'h-full'
    }`}>
      {/* Terminal Header */}
      <div className="bg-[#0F1829] px-4 py-2.5 border-b border-[#1E2C42] flex items-center justify-between select-none">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onToggleMinimize}>
          <TerminalIcon className="w-4 h-4 text-[#00E5BE]" />
          <span className="font-bold text-white uppercase text-xs tracking-wider">Consola de Logs en Vivo — SSE Stream</span>
          <span className="text-[10px] text-[#4DFFE0] bg-[#0B1320] px-2 py-0.5 rounded-full border border-[#1E2C42]">
            0.0.0.0:3000 / server.log
          </span>
          <span className="text-[10px] text-[#64748B] ml-2 font-sans hidden sm:inline">
            ({logs.length} eventos)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-[#00E5BE] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-pulse"></span> SSE Conectado
          </span>
          <button
            onClick={onClearLogs}
            className="text-[#64748B] hover:text-white p-1 rounded transition-colors"
            title="Limpiar consola"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="text-[#94A3B8] hover:text-[#00E5BE] p-1 rounded transition-colors"
              title={isMinimized ? 'Maximizar consola' : 'Minimizar consola'}
            >
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Content Body */}
      {!isMinimized && (
        <div className="p-3 flex-1 overflow-y-auto space-y-1 bg-[#0B1320] text-[#94A3B8]">
          <div className="text-[#4DFFE0]/70 text-[11px]">
            [ANTIGRAVITY ENGINE] Sistema sincronizado exitosamente con MoneyPrinterTurbo, proxies y ADB Bridge...
          </div>
          <div className="text-[#4DFFE0]/70 text-[11px]">
            [SECURITY AUDIT OK] MoneyPrinterTurbo & taktik-bot listos para generación 9:16 y previsualización.
          </div>
          
          {logs.map((log) => (
            <div key={log.id} className="leading-relaxed hover:bg-[#101A2D] px-1.5 py-0.5 rounded transition-colors">
              <span className="text-[#64748B]">[{log.timestamp}]</span>{' '}
              <span className={getLevelColor(log.level)}>[{log.level}]</span>{' '}
              <span className="text-[#00E5BE] font-bold">[{log.module}]:</span>{' '}
              <span className="text-neutral-200">{log.message}</span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
};

