import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ConfirmActionDialog({ title, detail, confirmLabel, dangerous = false, onCancel, onConfirm }: {
  title: string; detail: string; confirmLabel: string; dangerous?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCancel(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onCancel]);
  return <div className="ref-dialog-backdrop ref-confirm-backdrop" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
    <div ref={dialogRef} className="ref-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ref-confirm-title" aria-describedby="ref-confirm-detail">
      <header><span className={dangerous ? 'ref-confirm-icon danger' : 'ref-confirm-icon'}><AlertTriangle size={20}/></span><div><span className="ref-dialog-kicker">CONFIRMACIÓN DE ACCIÓN</span><h2 id="ref-confirm-title">{title}</h2></div><button type="button" onClick={onCancel} aria-label="Cerrar"><X size={18}/></button></header>
      <p id="ref-confirm-detail">{detail}</p>
      <footer><button ref={cancelRef} type="button" className="ref-dialog-secondary" onClick={onCancel}>Cancelar</button><button type="button" className={dangerous ? 'ref-danger-button' : 'ref-blue-button'} onClick={onConfirm}>{confirmLabel}</button></footer>
    </div>
  </div>;
}
