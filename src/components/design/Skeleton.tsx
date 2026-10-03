import React from 'react';

/**
 * Skeleton — TASK §22.2. Estados loading con skeletons accesibles.
 * `aria-busy="true"` indica al lector de pantalla que la región se está actualizando.
 */
interface SkeletonProps {
  className?: string;
  /** Número de líneas. */
  lines?: number;
  /** Ancho de la línea. */
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  lines = 1,
  width = '100%',
  height = 14,
}) => {
  const items = Array.from({ length: lines });
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando"
      className={className}
    >
      {items.map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="skeleton-bar"
          style={{
            width,
            height,
            marginBottom: i === items.length - 1 ? 0 : 6,
          }}
        />
      ))}
    </div>
  );
};