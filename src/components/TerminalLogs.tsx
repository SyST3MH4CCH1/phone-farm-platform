import React, { useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
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
      case 'ERROR': return 'var(--color-danger)';
      case 'WARN': return 'var(--color-warn)';
      case 'DEBUG': return 'var(--color-muted-2)';
      default: return 'var(--color-muted)';
    }
  };

  return (
    <div
      className="flex flex-col font-mono overflow-hidden"
      style={{ background: 'var(--color-canvas)', border: '1px solid var(--color-line)' }}
    >
      {/* Terminal Header */}
      <div
        className="px-4 py-2 flex items-center justify-between select-none cursor-pointer"
        style={{ background: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-line)' }}
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
            Consola Logs — SSE
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-muted-2)' }}>
            127.0.0.1:3000/server.log
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
            ({logs.length} eventos)
          </span>
        </div>

        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {/* Status — text only, no animation */}
          <span
            className="text-[10px] font-bold"
            style={{ color: sseConnected ? 'var(--color-ok)' : 'var(--color-muted-2)' }}
            aria-live="polite"
          >
            {sseConnected ? '● CONNECTED' : '○ DISCONNECTED'}
          </span>

          <button
            onClick={onClearLogs}
            className="btn-ghost text-[10px] px-2 py-1 uppercase tracking-wide"
            title="Limpiar consola"
          >
            Limpiar
          </button>

          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="btn-ghost text-[10px] px-2 py-1 uppercase tracking-wide"
              title={isMinimized ? 'Maximizar consola' : 'Minimizar consola'}
            >
              {isMinimized ? 'Maximizar' : 'Minimizar'}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Content */}
      {!isMinimized && (
        <div
          className="p-3 flex-1 overflow-y-auto text-[11px] space-y-0.5"
          style={{ background: 'var(--color-canvas)', color: 'var(--color-muted)' }}
          role="log"
          aria-live="polite"
          aria-atomic="false"
        >
          {logs.map((log) => (
            <div
              key={log.id}
              className="leading-relaxed px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span style={{ color: 'var(--color-muted-2)' }}>[{log.timestamp}]</span>{' '}
              <span style={{ color: getLevelColor(log.level), fontWeight: 700 }}>[{log.level}]</span>{' '}
              <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>[{log.module}]:</span>{' '}
              <span style={{ color: 'var(--color-text)' }}>{log.message}</span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
};
