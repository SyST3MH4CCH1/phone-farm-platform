import React from 'react';

/**
 * EmptyState — TASK §22.2.
 * Estado vacío explícito (sin lista, sin datos, sin filtros que coincidan).
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  /** Acción opcional (botón secundario del Panel). */
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, icon }) => (
  <div
    className="flex flex-col items-center justify-center text-center gap-3 py-10 px-6"
    style={{ color: 'var(--color-muted)' }}
    role="status"
  >
    {icon && (
      <div
        aria-hidden="true"
        className="w-12 h-12 flex items-center justify-center rounded-full"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted-2)' }}
      >
        {icon}
      </div>
    )}
    <div>
      <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-[12px] mt-1 max-w-md mx-auto" style={{ color: 'var(--color-muted-2)' }}>
          {description}
        </p>
      )}
    </div>
    {action && <div className="mt-2">{action}</div>}
  </div>
);