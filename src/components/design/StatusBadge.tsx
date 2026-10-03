import React from 'react';

/**
 * StatusBadge — TASK §22.2 componente compartido.
 * Variantes: ok / warn / danger / info / paused / running / leased / degraded / neutral / brand / ai.
 * Semantica TASK §9: brand=AZUL(accent), ok=VERDE, warn=AMARILLO,
 * danger=ROJO, ai=PURPURA (procesamiento / IA / MPT).
 * Icon + texto; nunca solo color (cumple TASK §4.4 / a11y §21).
 */
export type StatusBadgeKind =
  | 'ok' | 'warn' | 'danger' | 'info' | 'paused' | 'running'
  | 'leased' | 'degraded' | 'neutral' | 'brand' | 'ai';

interface StatusBadgeProps {
  kind: StatusBadgeKind;
  label: string;
  /** Si true, muestra un punto a la izquierda (semánticos) en lugar del icono sólido. */
  dot?: boolean;
  /** Para tipos "running" o "leased": suprime la animación del pulso. */
  quiet?: boolean;
  className?: string;
  title?: string;
}

const KIND_ICON: Record<StatusBadgeKind, string> = {
  ok: 'check',
  warn: 'alert',
  danger: 'alert',
  info: 'info',
  paused: 'pause',
  running: 'play',
  leased: 'lock',
  degraded: 'trending',
  neutral: 'circle',
  brand: 'sparkles',
  ai: 'cpu',
};

const KIND_FG: Record<StatusBadgeKind, string> = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  paused: 'var(--color-muted-2)',
  running: 'var(--color-brand)',
  leased: 'var(--color-info)',
  degraded: 'var(--color-warn)',
  neutral: 'var(--color-muted)',
  brand: 'var(--color-brand)',
  ai: 'var(--color-ai)',
};

const KIND_BG: Record<StatusBadgeKind, string> = {
  ok: 'rgba(34, 197, 94, 0.10)',
  warn: 'rgba(245, 158, 11, 0.10)',
  danger: 'rgba(239, 68, 68, 0.10)',
  info: 'rgba(56, 189, 248, 0.10)',
  paused: 'rgba(126, 133, 144, 0.10)',
  running: 'rgba(34, 197, 94, 0.10)',
  leased: 'rgba(56, 189, 248, 0.10)',
  degraded: 'rgba(245, 158, 11, 0.10)',
  neutral: 'rgba(158, 161, 168, 0.08)',
  brand: 'rgba(59, 130, 246, 0.10)',
  ai: 'rgba(168, 85, 247, 0.10)',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  kind, label, dot = false, quiet = false, className = '', title,
}) => {
  const fg = KIND_FG[kind];
  const bg = KIND_BG[kind];

  // Para `running` / `leased` no pulsamos en reduced motion (cumple §21).
  const pulseClass = !quiet && (kind === 'running' || kind === 'leased') ? 'status-pulse' : '';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded ${pulseClass} ${className}`}
      style={{
        color: fg,
        background: bg,
        border: `1px solid ${fg}33`,
      }}
      role="status"
      aria-label={label}
      title={title}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: fg }}
        />
      )}
      <span aria-hidden="true">{KIND_ICON[kind] === 'circle' ? '•' : '●'}</span>
      <span>{label}</span>
    </span>
  );
};