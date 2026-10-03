import React from 'react';

/**
 * ErrorState — TASK §22.2.
 * Estado de error visible, accionable, sin filtrar detalles internos peligrosos.
 */
interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Enumerate false para mostrar el botón "Reintentar". */
  retryable?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Algo salió mal',
  message,
  onRetry,
  retryable = true,
}) => (
  <div
    className="flex items-start gap-3 p-4 rounded border"
    style={{
      background: 'rgba(255, 59, 92, 0.06)',
      border: '1px solid rgba(255, 59, 92, 0.30)',
      color: 'var(--color-text)',
    }}
    role="alert"
  >
    <span
      aria-hidden="true"
      className="text-[18px] font-bold leading-none"
      style={{ color: 'var(--color-danger)' }}
    >
      ⚠
    </span>
    <div className="flex-1 min-w-0">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {message && (
        <p className="text-[12px] mt-1" style={{ color: 'var(--color-muted-2)' }}>
          {message}
        </p>
      )}
    </div>
    {retryable && onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="btn-secondary text-[11px] px-3 py-1"
      >
        Reintentar
      </button>
    )}
  </div>
);