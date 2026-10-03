// ---------------------------------------------------------------------------
// TASK §20 — Viewport real del operador.
//
// El breakpoint NO se decide por un ancho supuesto: se lee de `matchMedia`,
// que es lo que el navegador realmente reporta para el viewport actual. Los
// umbrales coinciden con los viewports mínimos que exige el TASK:
//
//   mobile  <  768px   (390×844 del smoke visual)
//   tablet  768–1279px
//   desktop 1280–1919px (1366×768, 1440×900, 1280×800)
//   wide    >= 1920px  (1920×1080, 2560×1440)
//
// SSR/no-DOM: cae a 'desktop', que es el perfil de uso principal del panel.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

export const BREAKPOINT_MIN_WIDTH: Record<Breakpoint, number> = {
  mobile: 0,
  tablet: 768,
  desktop: 1280,
  wide: 1920,
};

export function breakpointForWidth(width: number): Breakpoint {
  if (width < 768) return 'mobile';
  if (width < 1280) return 'tablet';
  if (width < 1920) return 'desktop';
  return 'wide';
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'desktop' : breakpointForWidth(window.innerWidth));

  useEffect(() => {
    const onResize = () => setBreakpoint(breakpointForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return breakpoint;
}

/** true cuando el viewport es lo bastante estrecho como para que la consola se esconda. */
export function isNarrow(breakpoint: Breakpoint): boolean {
  return breakpoint === 'mobile';
}
