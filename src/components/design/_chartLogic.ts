// TASK §7 — Lógica de charts (pura, sin render).
// Los componentes LineChart/BarChart/HeatMap en Charts.tsx usan estas
// funciones; los tests las cubren directamente.

export const CHART_PALETTE_LEN = 4;

/** Paleta semántica del design system (TASK §4.4). */
export const CHART_PALETTE = [
  'var(--color-info)',
  'var(--color-brand)',
  'var(--color-warn)',
  'var(--color-danger)',
] as const;

export function colorForSeries(index: number): string {
  return CHART_PALETTE[((index % CHART_PALETTE_LEN) + CHART_PALETTE_LEN) % CHART_PALETTE_LEN];
}

/** Filtra null/NaN de una serie temporal. */
export function validPoints(points: Array<number | null>): number[] {
  return points.filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
}

/** true si hay < 2 puntos válidos: no se puede dibujar una línea. */
export function isLineDrawable(points: Array<number | null>): boolean {
  return validPoints(points).length >= 2;
}

/**
 * Parte una serie en segmentos continuos, devolviendo los ÍNDICES
 * originales de cada segmento, para NO inventar el puente entre un
 * hueco y el siguiente (TASK §0: no fabricar datos).
 */
export function toSegmentIndices(points: Array<number | null>): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  points.forEach((p, i) => {
    if (typeof p === 'number' && Number.isFinite(p)) {
      cur.push(i);
    } else {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  });
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Variante por valores (para tests de contenido). */
export function toSegments(points: Array<number | null>): number[][] {
  return toSegmentIndices(points).map((idx) => idx.map((i) => points[i] as number));
}

/** Rango Y robusto; devuelve null si no hay datos. */
export function yRange(series: Array<Array<number | null>>): { lo: number; hi: number } | null {
  const all = series.flatMap(validPoints);
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  // Serie plana (lo === hi) → rango unitario para no dividir por cero.
  return { lo, hi: lo === hi ? lo + 1 : hi };
}

/** Escala de intensidad del heatmap: 0 = vacío, 4 pasos. */
export function heatIntensity(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (!(value > 0) || !(max > 0)) return 0;
  const r = value / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

/** Etiquetas de mes para el eje X, como máximo `max`. */
export function monthLabels(dates: string[]): string[] {
  return dates.map((d) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('es-ES', { month: 'short' });
  });
}
