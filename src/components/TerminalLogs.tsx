import React, { useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  /** FE-04: estado REAL del stream SSE (derivado de onopen/onerror). */
  sseConnected?: boolean;
}

export const TerminalLogs: React.FC<TerminalLogsProps> = ({
  logs,
  onClearLogs,
  isMinimized = false,
  onToggleMinimize,
  sseConnected = false
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMinimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'ERROR': return 'text-[#E05B5B] font-bold';
      case 'WARN': return 'text-[#A1A6AE] font-bold';
      case 'DEBUG': return 'text-zinc-500';
      default: return 'text-[#8A8F98] font-bold';
    }
  };

  return (
    <div className={`bg-[#1E2023] border border-[#2A2C30] rounded-xl flex flex-col font-mono text-xs overflow-hidden transition-all duration-300 ${
      isMinimized ? 'h-11' : 'h-full'
    }`}>
      {/* Terminal Header */}
      <div className="bg-[#232528] px-4 py-2.5 border-b border-[#2A2C30] flex items-center justify-between select-none">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onToggleMinimize}>
          <span className="font-bold text-[#E5E5E5] uppercase text-xs tracking-wider">Consola de Logs en Vivo — SSE Stream</span>
          <span className="text-[10px] text-[#A1A6AE] bg-[#1A1C1E] px-2 py-0.5 rounded-full border border-[#2A2C30]">
            127.0.0.1:3000 / server.log
          </span>
          <span className="text-[10px] text-[#6B7076] ml-2 font-sans hidden sm:inline">
            ({logs.length} eventos)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-[#8A8F98] font-bold">
            <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-[#6FBF73] animate-pulse' : 'bg-[#E05B5B]'}`}></span>
            {sseConnected ? 'SSE Conectado' : 'SSE Desconectado'}
          </span>
          <button
            onClick={onClearLogs}
            className="text-[10px] text-[#6B7076] hover:text-[#E5E5E5] px-2 py-1 rounded transition-colors font-bold uppercase"
            title="Limpiar consola"
          >
            Limpiar
          </button>
          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="text-[10px] text-[#9CA1A8] hover:text-[#8A8F98] px-2 py-1 rounded transition-colors font-bold uppercase"
              title={isMinimized ? 'Maximizar consola' : 'Minimizar consola'}
            >
              {isMinimized ? 'Maximizar' : 'Minimizar'}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Content Body */}
      {!isMinimized && (
        <div className="p-3 flex-1 overflow-y-auto space-y-1 bg-[#1A1C1E] text-[#9CA1A8]">
          
          {logs.map((log) => (
            <div key={log.id} className="leading-relaxed hover:bg-[#1E2023] px-1.5 py-0.5 rounded transition-colors">
              <span className="text-[#6B7076]">[{log.timestamp}]</span>{' '}
              <span className={getLevelColor(log.level)}>[{log.level}]</span>{' '}
              <span className="text-[#8A8F98] font-bold">[{log.module}]:</span>{' '}
              <span className="text-[#E5E5E5]">{log.message}</span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
};

