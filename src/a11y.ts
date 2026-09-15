import { useEffect, useRef } from 'react';

/**
 * Minimal focus trap for modals (no Radix dependency).
 * Traps Tab/Shift+Tab cycling within container.
 * Escape calls onClose.
 * Restores focus to trigger element on unmount (via triggerRef or saved activeElement).
 *
 * ponytail: ~35 lines — no abstraction, no library, just the hook T4 will reuse.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  triggerRef?: React.RefObject<HTMLElement | null>
) {
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    prevFocus.current = document.activeElement;

    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Move focus into trap
    (first ?? container).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        if (focusable.length === 0) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Restore focus to trigger or previous active element
      const restore = triggerRef?.current ?? prevFocus.current;
      if (restore instanceof HTMLElement) restore.focus();
    };
  }, [containerRef, onClose, triggerRef]);
}
