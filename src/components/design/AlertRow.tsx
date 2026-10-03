import React from 'react';
import { StatusBadge, StatusBadgeKind } from './StatusBadge';

/**
 * AlertRow — TASK §9.4 alertas con acciones; TASK §22.2 componente compartido.
 *
 * Una alerta accionable: severidad + descripción corta + acciones primarias
 * (revisar / reintentar / abrir job / silenciar 24h).
 */
interface AlertRowProps {
  kind: StatusBadgeKind;
  title: string;
  /** Detalle expandible opcional. */
  detail?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions?: Array<{ label: string; onClick: () => void; tone?: 'primary' | 'secondary' | 'danger' }>;
  /** ISO 8601 timestamp; se muestra compacto con toLocaleString(). */
  at?: string;
}

const SEVERITY_LABEL: Record<AlertRowProps['severity'], string> = {
  low: 'low', medium: 'med', high: 'high', critical: 'crit',
};

export const AlertRow: React.FC<AlertRowProps> = ({ kind, title, detail, severity, actions, at }) => {
  const sevKind: StatusBadgeKind = severity === 'critical' || severity === 'high' ? 'danger' : severity === 'medium' ? 'warn' : 'info';
  return (
    <div
      className="flex items-start justify-between gap-4 p-3 rounded border"
      style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-line)' }}
      role="alert"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <StatusBadge kind={sevKind} label={SEVERITY_LABEL[severity]} dot />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
              {title}
            </span>
            <StatusBadge kind={kind} label={kind} quiet />
          </div>
          {detail && (
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-muted-2)' }}>
              {detail}
            </p>
          )}
          {at && (
            <span className="text-[10px] font-mono mt-1 inline-block" style={{ color: 'var(--color-muted-2)' }}>
              {new Date(at).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className={
                a.tone === 'danger' ? 'btn-danger text-[11px] px-2.5 py-1'
                : a.tone === 'primary' ? 'btn-primary text-[11px] px-2.5 py-1'
                : 'btn-secondary text-[11px] px-2.5 py-1'
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};