import React, { useRef, useEffect, useState, useMemo } from 'react';
import { LogEntry } from '../types';
import { redactSecrets } from './design/_redact';

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  sseConnected?: boolean;
}

type LogLevel = LogEntry['level'];
type Filter = LogLevel | 'ALL';
const LEVELS: Filter[] = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
const LEVEL_LABEL: Record<Filter, string> = {
  ALL: 'Todos', ERROR: 'Error', WARN: 'Aviso', INFO: 'Info', DEBUG: 'Debug',
};

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'ERROR': return 'var(--color-danger)';
    case 'WARN': return 'var(--color-warn)';
    case 'DEBUG': return 'var(--color-muted-2)';
    default: return 'var(--color-muted)';
  }
}

export const TerminalLogs: React.FC<TerminalLogsProps> = ({
  logs, onClearLogs, isMinimized = false, onToggleMinimize, sseConnected = false,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter !== 'ALL' && l.level !== filter) return false;
      if (q && !(l.message.toLowerCase().includes(q) || l.module.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, filter, query]);

  useEffect(() => {
    if (!isMinimized && autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filtered, isMinimized, autoScroll]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: logs.length, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    for (const l of logs) c[l.level] = (c[l.level] || 0) + 1;
    return c;
  }, [logs]);

  return (
    <div
      className="flex flex-col font-mono overflow-hidden"
      style={{ background: 'var(--color-canvas)', border: '1px solid var(--color-line)' }}
    >
      {/* Terminal Header */}
      <div
        className="px-4 py-2 flex items-center justify-between select-none cursor-pointer flex-wrap gap-2"
        style={{ background: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-line)' }}
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
            Consola Logs — SSE
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-muted-2)' }}>
            127.0.0.1:3000/server.log
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
            ({filtered.length} / {logs.length} eventos)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {/* Level filter */}
          <div className="flex items-center gap-1" role="group" aria-label="Filtro por nivel">
            {LEVELS.map((lvl) => {
              const active = filter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilter(lvl)}
                  className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{
                    background: active ? 'var(--color-surface-2)' : 'transparent',
                    color: active ? 'var(--color-text)' : 'var(--color-muted-2)',
                    border: `1px solid ${active ? 'var(--color-line)' : 'transparent'}`,
                  }}
                  aria-pressed={active}
                  title={`${LEVEL_LABEL[lvl]} (${counts[lvl]})`}
                >
                  {lvl}
                  <span className="ml-1 text-[9px] opacity-70">{counts[lvl]}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="input text-[10px] px-2 py-0.5 w-32"
            aria-label="Buscar en consola"
          />

          {/* Auto-scroll */}
          <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-brand"
              aria-label="Auto-scroll"
            />
            Auto
          </label>

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
              aria-label={isMinimized ? 'Maximizar consola' : 'Minimizar consola'}
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
          {filtered.length === 0 && (
            <div className="text-center text-[11px] py-6" style={{ color: 'var(--color-muted-2)' }}>
              {logs.length === 0 ? 'Sin eventos.' : 'Sin resultados para este filtro.'}
            </div>
          )}
          {filtered.map((log) => (
            <div
              key={log.id}
              className="leading-relaxed px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span style={{ color: 'var(--color-muted-2)' }}>[{log.timestamp}]</span>{' '}
              <span style={{ color: getLevelColor(log.level), fontWeight: 700 }}>[{log.level}]</span>{' '}
              <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>[{log.module}]:</span>{' '}
              <span style={{ color: 'var(--color-text)' }}>{redactSecrets(log.message)}</span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
};