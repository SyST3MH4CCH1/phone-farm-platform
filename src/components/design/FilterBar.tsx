import React from 'react';

/**
 * FilterBar — TASK §22.2. Buscador + chips de filtro.
 */
export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterBarProps<T extends string> {
  /** Valor del input de búsqueda. */
  query: string;
  onQueryChange: (next: string) => void;
  /** Chips de filtro. Si está vacío, se ocultan. */
  options?: FilterOption<T>[];
  activeOption?: T;
  onActiveOptionChange?: (next: T) => void;
  placeholder?: string;
  className?: string;
}

export function FilterBar<T extends string>({
  query, onQueryChange, options, activeOption, onActiveOptionChange, placeholder = 'Buscar…', className = '',
}: FilterBarProps<T>) {
  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="input min-w-[180px] flex-1 max-w-xs"
        aria-label="Buscar"
      />
      {options && options.length > 0 && onActiveOptionChange && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Filtros">
          {options.map((opt) => {
            const active = activeOption === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onActiveOptionChange(opt.value)}
                className="text-[11px] px-2.5 py-1 rounded uppercase tracking-wider"
                style={{
                  background: active ? 'var(--color-surface-3)' : 'var(--color-surface-1)',
                  color: active ? 'var(--color-text)' : 'var(--color-muted-2)',
                  border: '1px solid var(--color-line)',
                }}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}