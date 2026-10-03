import React, { useState, useId } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * CollapsibleSection — TASK §13.5 MoneyPrinter "8 secciones plegables".
 *
 * Componente genérico: header clicable con icono + label + contador
 * opcional, cuerpo plegable. Accesible:
 *  - El header es un `<button>` real (tecleable, foco visible).
 *  - `aria-expanded` refleja el estado.
 *  - `aria-controls` apunta al id del cuerpo.
 *  - Respeta prefers-reduced-motion (sin animación de altura; aquí es
 *    mount/unmount, no hay transición, así que ya lo cumple).
 */
interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Default abierto. */
  defaultOpen?: boolean;
  /** Texto corto a la derecha del título (ej. "3 campos", "verificado"). */
  hint?: string;
  /** Badge con el valor actual del campo principal. */
  badge?: string;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title, icon, defaultOpen = false, hint, badge, children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      style={{
        background: 'var(--color-surface-3)',
        border: '1px solid var(--color-line)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="w-full px-4 py-2.5 flex items-center gap-2 text-left transition-colors"
          style={{ color: 'var(--color-text)' }}
        >
          <span aria-hidden="true" style={{ color: 'var(--color-info)' }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          {icon && <span aria-hidden="true">{icon}</span>}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {title}
          </span>
          {badge && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'var(--color-surface-1)', color: 'var(--color-muted)' }}
            >
              {badge}
            </span>
          )}
          {hint && (
            <span className="ml-auto text-[10px] font-normal" style={{ color: 'var(--color-muted-2)' }}>
              {hint}
            </span>
          )}
        </button>
      </h3>
      {open && (
        <div
          id={bodyId}
          className="px-4 pb-4 pt-1 space-y-3"
          style={{ borderTop: '1px solid var(--color-line)' }}
        >
          {children}
        </div>
      )}
    </section>
  );
};
