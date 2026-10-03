import { describe, it, expect } from 'vitest';
import {
  colorForSeries,
  validPoints,
  isLineDrawable,
  toSegments,
  toSegmentIndices,
  yRange,
  heatIntensity,
  monthLabels,
  CHART_PALETTE,
  CHART_PALETTE_LEN,
} from '../src/components/design/_chartLogic';

/**
 * TASK §7 — Charts SVG inline.
 * Reglas que se verifican aquí:
 *  - No inventar datos: los huecos (null) NUNCA se interpolan.
 *  - Paleta limitada y determinista.
 *  - Estados vacíos explícitos.
 */

describe('chart logic (TASK §7)', () => {
  describe('colorForSeries — paleta determinista', () => {
    it('la paleta tiene 4 colores (TASK §7: 3-4 series)', () => {
      expect(CHART_PALETTE).toHaveLength(CHART_PALETTE_LEN);
      expect(CHART_PALETTE_LEN).toBe(4);
    });
    it('cicla por indice', () => {
      expect(colorForSeries(0)).toBe(CHART_PALETTE[0]);
      expect(colorForSeries(3)).toBe(CHART_PALETTE[3]);
      expect(colorForSeries(4)).toBe(CHART_PALETTE[0]);
      expect(colorForSeries(7)).toBe(CHART_PALETTE[3]);
    });
    it('soporta indices negativos sin romper', () => {
      expect(colorForSeries(-1)).toBe(CHART_PALETTE[3]);
    });
  });

  describe('validPoints / isLineDrawable', () => {
    it('filtra null, NaN e Infinity', () => {
      expect(validPoints([1, null, 2, NaN, 3, Infinity, 4])).toEqual([1, 2, 3, 4]);
    });
    it('una serie con < 2 puntos válidos NO es dibujable', () => {
      expect(isLineDrawable([])).toBe(false);
      expect(isLineDrawable([5])).toBe(false);
      expect(isLineDrawable([null, NaN])).toBe(false);
    });
    it('una serie con >= 2 puntos válidos SÍ es dibujable', () => {
      expect(isLineDrawable([1, 2])).toBe(true);
      expect(isLineDrawable([1, null, 2])).toBe(true);
    });
  });

  describe('toSegments / toSegmentIndices — NO inventar el puente', () => {
    it('serie continua → 1 segmento', () => {
      expect(toSegments([1, 2, 3])).toEqual([[1, 2, 3]]);
    });
    it('hueco en medio → 2 segmentos (NO conecta 1 con 3)', () => {
      const segs = toSegments([1, 2, null, 4, 5]);
      expect(segs).toEqual([[1, 2], [4, 5]]);
      expect(segs).toHaveLength(2);
    });
    it('varios huecos → tantos segmentos', () => {
      expect(toSegments([1, 2, null, 4, 5, null, 7, 8])).toHaveLength(3);
    });
    it('segmentos de 1 punto NO se emiten (no se pueden dibujar)', () => {
      expect(toSegments([1, null, 3, 4])).toEqual([[3, 4]]);
    });
    it('serie totalmente vacía → 0 segmentos', () => {
      expect(toSegments([null, null])).toEqual([]);
      expect(toSegments([])).toEqual([]);
    });
    it('toSegmentIndices devuelve los índices originales', () => {
      expect(toSegmentIndices([1, 2, null, 4, 5])).toEqual([[0, 1], [3, 4]]);
    });
    it('toSegmentIndices/toSegments son consistentes', () => {
      const pts: Array<number | null> = [1, null, 3, 4, null, 6, 7];
      const idx = toSegmentIndices(pts);
      const vals = toSegments(pts);
      expect(idx.map((s) => s.map((i) => pts[i] as number))).toEqual(vals);
    });
  });

  describe('yRange', () => {
    it('devuelve null si no hay datos (el chart muestra empty state)', () => {
      expect(yRange([[], [null, NaN]])).toBeNull();
    });
    it('calcula min/max entre todas las series', () => {
      expect(yRange([[1, 5], [0, 3]])).toEqual({ lo: 0, hi: 5 });
    });
    it('serie plana → rango unitario (evita división por cero)', () => {
      expect(yRange([[7, 7, 7]])).toEqual({ lo: 7, hi: 8 });
    });
  });

  describe('heatIntensity — 4 pasos, 0 = sin actividad', () => {
    it('valor 0 o negativo → nivel 0 (celda vacía)', () => {
      expect(heatIntensity(0, 10)).toBe(0);
      expect(heatIntensity(-3, 10)).toBe(0);
    });
    it('max 0 o negativo → todo nivel 0', () => {
      expect(heatIntensity(5, 0)).toBe(0);
    });
    it('escala 0..max en 4 tramos', () => {
      expect(heatIntensity(1, 4)).toBe(1);   // 0.25
      expect(heatIntensity(2, 4)).toBe(2);   // 0.50
      expect(heatIntensity(3, 4)).toBe(3);   // 0.75
      expect(heatIntensity(4, 4)).toBe(4);   // 1.00
    });
    it('el valor máximo siempre es nivel 4', () => {
      expect(heatIntensity(999, 999)).toBe(4);
    });
  });

  describe('monthLabels', () => {
    it('genera una etiqueta por fecha', () => {
      const l = monthLabels(['2026-10-01', '2026-10-02', '2026-11-01']);
      expect(l).toHaveLength(3);
      expect(l[0]).toBe(l[1]);
      expect(l[0]).not.toBe(l[2]);
    });
    it('array vacío → array vacío', () => {
      expect(monthLabels([])).toEqual([]);
    });
  });
});
