import { describe, it, expect } from 'vitest';
import { BREAKPOINT_MIN_WIDTH, breakpointForWidth } from '../src/a11y/viewport';

describe('TASK §20 — clasificación de viewport', () => {
  it('los viewports de escritorio del TASK caen en desktop/wide', () => {
    // 1366×768, 1440×900, 1280×800
    expect(breakpointForWidth(1366)).toBe('desktop');
    expect(breakpointForWidth(1440)).toBe('desktop');
    expect(breakpointForWidth(1280)).toBe('desktop');
    // 1920×1080, 2560×1440
    expect(breakpointForWidth(1920)).toBe('wide');
    expect(breakpointForWidth(2560)).toBe('wide');
  });

  it('tablet cubre 768–1279', () => {
    expect(breakpointForWidth(768)).toBe('tablet');
    expect(breakpointForWidth(1024)).toBe('tablet');
    expect(breakpointForWidth(1279)).toBe('tablet');
  });

  it('mobile cubre el smoke visual 390×844 y por debajo', () => {
    expect(breakpointForWidth(390)).toBe('mobile');
    expect(breakpointForWidth(767)).toBe('mobile');
    expect(breakpointForWidth(360)).toBe('mobile');
  });

  it('los límites son contiguos y sin huecos ni solapamientos', () => {
    const ordered = Object.values(BREAKPOINT_MIN_WIDTH);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    // Barrido completo: cada ancho cae en exactamente una categoría.
    for (let w = 0; w <= 2560; w += 1) {
      const bp = breakpointForWidth(w);
      const min = BREAKPOINT_MIN_WIDTH[bp];
      const nextMin = ordered.filter((m) => m > min)[0] ?? Infinity;
      expect(w).toBeGreaterThanOrEqual(min);
      expect(w).toBeLessThan(nextMin);
    }
  });
});
