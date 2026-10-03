import React from 'react';
import { StatusBadge } from './StatusBadge';

/**
 * HealthIndicator — TASK §22.2.
 * Indicador de salud de un servicio (Flask, MPT, MCP, Proxy, Device).
 */
interface HealthIndicatorProps {
  service: string;
  online: boolean | null;
  latency_ms?: number | null;
  detail?: string;
}

export const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  service, online, latency_ms, detail,
}) => {
  const kind = online === null ? 'neutral' : online ? 'ok' : 'danger';
  const label = online === null ? '—' : online ? 'Online' : 'Offline';

  return (
    <div className="flex items-center justify-between gap-3 text-[12px] py-1.5" role="group" aria-label={`${service} health`}>
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge kind={kind} label={label} dot />
        <span className="truncate" style={{ color: 'var(--color-text)' }}>{service}</span>
      </div>
      <div className="flex items-center gap-3" style={{ color: 'var(--color-muted-2)' }}>
        {typeof latency_ms === 'number' && Number.isFinite(latency_ms) && (
          <span className="font-mono text-[11px]" title="Latency">
            {latency_ms} ms
          </span>
        )}
        {detail && (
          <span className="text-[11px] truncate max-w-[160px]" title={detail}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
};