import React, { useState } from 'react';
import { colorForSeries, isLineDrawable, toSegmentIndices, yRange, heatIntensity, CHART_PALETTE } from './_chartLogic';

export { CHART_PALETTE };

/**
 * Charts SVG inline — TASK §7 y §9.3 (fila analítica del dashboard).
 *
 * Reglas del TASK §7 que se respetan aquí:
 *  - Sin Recharts / Chart.js. SVG inline, cero dependencias.
 *  - Sin 3D, sin relleno degradado, sin animación de entrada.
 *  - Paleta limitada: 3-4 series, colores semánticos del design system.
 *  - Grid sutil, ejes con unidades, tooltip al hover/focus.
 *  - Estados loading / empty / error explícitos (nunca un chart vacío
 *    fingiendo datos).
 *  - Accesible: role="img" + aria-label con el resumen, y puntos
 *    focables con tabindex para leer el valor exacto.
 */

// La paleta vive en _chartLogic.ts (testeable).

// ─────────────────────────────────────────────────────────────
// LineChart — series temporales (CPU/RAM a lo largo del tiempo)
// ─────────────────────────────────────────────────────────────

export interface LineSeries {
  key: string;
  label: string;
  /** null = hueco (no dato). El chart abre la línea, no inventa. */
  points: Array<number | null>;
  unit?: string;
}

interface LineChartProps {
  series: LineSeries[];
  /** Etiquetas del eje X (mismo length que points). */
  labels: string[];
  height?: number;
  /** Rango del eje Y. Si se omite, se calcula de los datos. */
  yMin?: number;
  yMax?: number;
  yUnit?: string;
  /** Título accesible. */
  title: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  series, labels, height = 140, yMin, yMax, yUnit = '', title,
}) => {
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);

  const hasAny = series.some((s) => isLineDrawable(s.points));
  if (!hasAny) {
    return (
      <div
        className="flex items-center justify-center text-[11px]"
        style={{ height, color: 'var(--color-muted-2)' }}
        role="status"
      >
        Sin datos suficientes para el periodo
      </div>
    );
  }

  const W = 640;
  const H = height;
  const PAD_L = 42;
  const PAD_R = 12;
  const PAD_T = 10;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const auto = yRange(series.map((s) => s.points));
  const lo = yMin ?? auto!.lo;
  const hi = yMax ?? auto!.hi;
  const range = hi - lo || 1;
  const n = Math.max(...series.map((s) => s.points.length), labels.length, 2);
  const stepX = innerW / (n - 1 || 1);

  const x = (i: number) => PAD_L + i * stepX;
  const y = (v: number) => PAD_T + innerH - ((v - lo) / range) * innerH;

  const ticks = [lo, lo + range / 2, hi];

  // Serie con huecos: segmentos continuos, nunca inventando el puente.
  const segments = (points: Array<number | null>) =>
    toSegmentIndices(points).map((idx) => ({
      pts: idx.map((i) => `${x(i).toFixed(1)},${y(points[i] as number).toFixed(1)}`).join(' '),
    }));

  const summary = series
    .map((s) => {
      const v = s.points.filter((p): p is number => typeof p === 'number');
      if (v.length === 0) return `${s.label}: sin datos`;
      const last = v[v.length - 1];
      return `${s.label}: ${last}${s.unit ?? yUnit}`;
    })
    .join(' · ');

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${title}. ${summary}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid + eje Y */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)}
              stroke="var(--color-line)" strokeWidth={1}
              strokeDasharray={i === 0 || i === ticks.length - 1 ? 'none' : '2 4'}
            />
            <text x={PAD_L - 6} y={y(t) + 3} fontSize={9} textAnchor="end" fill="var(--color-muted-2)">
              {t.toFixed(0)}{yUnit}
            </text>
          </g>
        ))}

        {/* Eje X: primera, central y última etiqueta */}
        {labels.length > 0 && (
          [0, Math.floor((n - 1) / 2), n - 1]
            .filter((v, i, arr) => v >= 0 && v < n && arr.indexOf(v) === i)
            .map((i) => (
              <text
                key={i}
                x={x(i)} y={H - 6}
                fontSize={9}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fill="var(--color-muted-2)"
              >
                {labels[i] ?? ''}
              </text>
            ))
        )}

        {/* Líneas */}
        {series.map((s, si) => (
          <g key={s.key}>
            {segments(s.points).map((seg, k) => (
              <polyline
                key={k}
                points={seg.pts}
                fill="none"
                stroke={colorForSeries(si)}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>
        ))}

        {/* Crosshair + puntos en hover */}
        {hover && (
          <>
            <line
              x1={x(hover.i)} x2={x(hover.i)} y1={PAD_T} y2={PAD_T + innerH}
              stroke="var(--color-muted-2)" strokeWidth={1} strokeDasharray="3 3"
            />
            {series.map((s, si) => {
              const p = s.points[hover.i];
              if (typeof p !== 'number' || !Number.isFinite(p)) return null;
              return (
                <circle
                  key={s.key}
                  cx={x(hover.i)} cy={y(p)} r={3.5}
                  fill="var(--color-canvas)"
                  stroke={colorForSeries(si)}
                  strokeWidth={2}
                />
              );
            })}
          </>
        )}

        {/* Zonas de captura (invisible, para tooltip) */}
        {Array.from({ length: n }).map((_, i) => (
          <rect
            key={i}
            x={x(i) - stepX / 2} y={PAD_T}
            width={stepX} height={innerH}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={
              series
                .map((s) => {
                  const p = s.points[i];
                  return `${s.label} ${typeof p === 'number' ? p + (s.unit ?? yUnit) : 'sin dato'}`;
                })
                .join(', ')
            }
            onMouseEnter={() => setHover({ s: 0, i })}
            onFocus={() => setHover({ s: 0, i })}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hover && labels[hover.i] && (
        <div
          className="absolute pointer-events-none px-2 py-1 text-[10px] font-mono rounded"
          style={{
            background: 'var(--color-surface-4)',
            border: '1px solid var(--color-line)',
            color: 'var(--color-text)',
            left: `${(x(hover.i) / W) * 100}%`,
            top: 0,
            transform: 'translateX(-50%)',
            zIndex: 5,
          }}
        >
          <div style={{ color: 'var(--color-muted-2)' }}>{labels[hover.i]}</div>
          {series.map((s, si) => {
            const p = s.points[hover.i];
            return (
              <div key={s.key} style={{ color: colorForSeries(si) }}>
                {s.label}: {typeof p === 'number' ? `${p}${s.unit ?? yUnit}` : '—'}
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-3 flex-wrap mt-1" role="list" aria-label="Leyenda">
        {series.map((s, si) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[10px]" role="listitem" style={{ color: 'var(--color-muted)' }}>
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: colorForSeries(si) }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BarChart — comparación (publicaciones por día, jobs por bucket)
// ─────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  /** Color semántico; si se omite usa la paleta. */
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  yUnit?: string;
  title: string;
}

export const BarChart: React.FC<BarChartProps> = ({ data, height = 140, yUnit = '', title }) => {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px]"
        style={{ height, color: 'var(--color-muted-2)' }}
        role="status"
      >
        Sin datos para el periodo
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 640;
  const H = height;
  const PAD_L = 42;
  const PAD_R = 12;
  const PAD_T = 10;
  const PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slot = innerW / data.length;
  const barW = Math.min(38, slot * 0.66);

  const ticks = [0, max / 2, max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={title}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R}
              y1={PAD_T + innerH - (t / max) * innerH}
              y2={PAD_T + innerH - (t / max) * innerH}
              stroke="var(--color-line)" strokeWidth={1}
              strokeDasharray={i === 0 ? 'none' : '2 4'}
            />
            <text
              x={PAD_L - 6}
              y={PAD_T + innerH - (t / max) * innerH + 3}
              fontSize={9} textAnchor="end" fill="var(--color-muted-2)"
            >
              {Math.round(t)}{yUnit}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const cx = PAD_L + slot * i + slot / 2;
          const color = d.color ?? colorForSeries(i);
          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={PAD_T + innerH - h}
                width={barW}
                height={Math.max(h, d.value > 0 ? 1 : 0)}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.55}
                rx={2}
              />
              {d.value > 0 && (
                <text
                  x={cx} y={PAD_T + innerH - h - 4}
                  fontSize={9} textAnchor="middle" fill={color}
                >
                  {d.value}
                </text>
              )}
              <text
                x={cx} y={H - 8}
                fontSize={9} textAnchor="middle" fill="var(--color-muted-2)"
              >
                {d.label}
              </text>
              {/* zona de captura */}
              <rect
                x={PAD_L + slot * i} y={PAD_T} width={slot} height={innerH}
                fill="transparent" tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${d.value}${yUnit}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// HeatMap — actividad por día (calendario de publicaciones)
// ─────────────────────────────────────────────────────────────

export interface HeatCell {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number;
}

interface HeatMapProps {
  cells: HeatCell[];
  weeks?: number;
  title: string;
  unit?: string;
}

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const HeatMap: React.FC<HeatMapProps> = ({ cells, weeks = 13, title, unit = '' }) => {
  const [hover, setHover] = useState<HeatCell | null>(null);

  if (cells.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] h-[100px]"
        style={{ color: 'var(--color-muted-2)' }}
        role="status"
      >
        Sin actividad registrada
      </div>
    );
  }

  const max = Math.max(...cells.map((c) => c.value), 1);
  const byDate = new Map(cells.map((c) => [c.date, c.value]));

  // Alinea al lunes más cercano hacia atrás.
  const last = new Date(cells.reduce((m, c) => (c.date > m ? c.date : m), cells[0].date) + 'T00:00:00');
  const offset = (last.getDay() + 6) % 7;
  const end = new Date(last);
  end.setDate(end.getDate() - offset);
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const COLS = weeks;
  const CELL = 11;
  const GAP = 2;
  const PAD_T = 14;
  const PAD_L = 16;
  const W = PAD_L + COLS * (CELL + GAP);
  const H = PAD_T + 7 * (CELL + GAP) + 4;

  const grid: Array<{ date: string; value: number }> = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    grid.push({ date: iso, value: byDate.get(iso) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }

  // Escala de intensidad: 0 → vacío; 1..4 → pasos.
  const INTENSITY_VAR = [
    'var(--color-surface-2)',
    'rgba(0,255,136,0.25)',
    'rgba(0,255,136,0.45)',
    'rgba(0,255,136,0.70)',
    'rgba(0,255,136,0.95)',
  ];
  const intensityColor = (v: number) => INTENSITY_VAR[heatIntensity(v, max)];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}. ${cells.filter((c) => c.value > 0).length} días con actividad.`}>
        {DOW.map((d, i) => (
          <text key={d} x={4} y={PAD_T + i * (CELL + GAP) + CELL - 2} fontSize={8} fill="var(--color-muted-2)">
            {d}
          </text>
        ))}
        {grid.map((g, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          const dateObj = new Date(g.date + 'T00:00:00');
          const label = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <rect
              key={g.date}
              x={PAD_L + col * (CELL + GAP)}
              y={PAD_T + row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={intensityColor(g.value)}
              stroke={hover?.date === g.date ? 'var(--color-text)' : 'transparent'}
              strokeWidth={1}
              tabIndex={0}
              role="button"
              aria-label={`${label}: ${g.value}${unit}`}
              onMouseEnter={() => setHover({ date: g.date, value: g.value })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ date: g.date, value: g.value })}
              onBlur={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none px-2 py-1 text-[10px] font-mono rounded"
          style={{
            background: 'var(--color-surface-4)',
            border: '1px solid var(--color-line)',
            color: 'var(--color-text)',
            right: 0,
            top: 0,
          }}
        >
          {new Date(hover.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}: {hover.value}{unit}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1 text-[10px]" style={{ color: 'var(--color-muted-2)' }}>
        <span>menos</span>
        {[0, 0.3, 0.6, 1].map((r) => (
          <span
            key={r}
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ background: r === 0 ? 'var(--color-surface-2)' : intensityColor(r * max) }}
          />
        ))}
        <span>más (max {max}{unit})</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ChartCard — contenedor con título, estado y来源 (§22.2)
// ─────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  /** Fuente de datos (TASK §6: cada métrica declara su origen). */
  source?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Motivo por el que no hay datos; se muestra como empty state. */
  emptyReason?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title, source, action, children, emptyReason,
}) => (
  <section
    className="rounded-lg border p-3 flex flex-col"
    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
  >
    <header className="flex items-start justify-between gap-2 mb-2">
      <div className="min-w-0">
        <h3 className="text-[11px] font-mono uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h3>
        {source && (
          <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-muted-2)' }} title={source}>
            {source}
          </p>
        )}
      </div>
      {action}
    </header>
    {emptyReason ? (
      <div
        className="flex-1 flex items-center justify-center text-[11px] text-center px-3"
        style={{ color: 'var(--color-muted-2)' }}
        role="status"
      >
        {emptyReason}
      </div>
    ) : (
      <div className="flex-1">{children}</div>
    )}
  </section>
);
