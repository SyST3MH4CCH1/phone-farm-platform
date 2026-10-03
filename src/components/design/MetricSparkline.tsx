import React from 'react';

/**
 * MetricSparkline — TASK §22.2.
 * Sparkline SVG inline. Sin librería externa (cumple §7).
 * Si `data` está vacío o todos los puntos son null, muestra empty state.
 */
interface MetricSparklineProps {
  data: Array<number | null>;
  width?: number;
  height?: number;
  /** Si `true`, usa --color-brand en lugar de --color-info. */
  brand?: boolean;
  /** Etiqueta visible solo para lector de pantalla. */
  label?: string;
}

export const MetricSparkline: React.FC<MetricSparklineProps> = ({
  data,
  width = 80,
  height = 28,
  brand = false,
  label,
}) => {
  const valid = data.filter((d): d is number => typeof d === 'number' && Number.isFinite(d));

  if (valid.length < 2) {
    return (
      <span
        aria-label={label ?? 'Sin datos'}
        role="img"
        style={{
          width,
          height,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-muted-2)',
          fontSize: 10,
        }}
      >
        —
      </span>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const points = data
    .map((d, i) => {
      if (d === null || !Number.isFinite(d)) return null;
      const x = i * step;
      const y = height - ((d - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  const stroke = brand ? 'var(--color-brand)' : 'var(--color-info)';
  const fill = brand ? 'rgba(34, 197, 94, 0.10)' : 'rgba(56, 189, 248, 0.10)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      {points && (
        <>
          <polyline
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      <text
        x={width}
        y={height - 2}
        fontSize={9}
        fill={stroke}
        textAnchor="end"
        opacity={0.6}
      >
        n={valid.length}
      </text>
    </svg>
  );
};