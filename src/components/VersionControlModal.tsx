import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { Account, ProxyItem, QueueJob, StackInfo } from '../types';
import { apiFetch } from '../api';

interface VersionControlModalProps {
  accounts: Account[];
  proxies: ProxyItem[];
  queue: QueueJob[];
  /** Stack info real del panel (TASK §18). Opcional. */
  stack?: StackInfo | null;
  onClose: () => void;
  onDownloadZip: () => void;
}

/**
 * VersionControlModal — TASK §18.
 *
 * Antes: hardcoded `versions` array con v2.4/v2.3/v2.2, autores ficticios
 * ("Antigravity Core", "PhoneFarm Devs"), branding "TH3F4Rm3R", badge
 * "ACTIVA EN PRODUCCIÓN". Eso viola TASK §30 (no inventar / no Staging /
 * Production / Rollback ficticios).
 *
 * Ahora: muestra datos reales del repo + MPT pin + git SHA. Sin historial
 * ficticio. Si no hay datos reales, se muestra `—`.
 */
export const VersionControlModal: React.FC<VersionControlModalProps> = ({
  accounts, proxies: _, queue, stack, onClose, onDownloadZip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  // §0 / §30 — sin generar resetas para un "Rollback" ficticio. Solo existe
  // la rama actual en git; el operador puede usar git checkout / git reset
  // por su cuenta, pero NO exponemos botones que simulen esa operación.
  const [selectedVersion, setSelectedVersion] = useState<'current' | 'export'>('current');

  const handleExportEncrypted = async () => {
    const passphrase = window.prompt('Passphrase del backup (>=12 chars, se pedirá al restaurar):');
    if (!passphrase || passphrase.length < 12) {
      window.alert('Passphrase requerida (>=12 caracteres). Exportación cancelada.');
      return;
    }
    const password = window.prompt('Reautenticación: password del panel (admin):');
    if (!password) return;
    try {
      const res = await apiFetch('/api/backups/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(`Exportación fallida: ${data?.error || res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phonefarm-${new Date().toISOString().slice(0, 10)}.pfbackup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.alert('Backup cifrado (.pfbackup) descargado. Guarda la passphrase: es necesaria para restaurar.');
    } catch (err) {
      window.alert(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const git_sha = stack?.git_sha ?? null;
  const package_version = stack?.package_version ?? null;
  const mpt_pinned_sha = stack?.mpt_pinned_sha ?? null;
  const mpt_pinned_version = stack?.mpt_pinned_version ?? null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header — sin "TH3F4Rm3R" fake */}
        <div className="bg-[#232528] px-6 py-4 border-b border-[#2A2C30] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E] font-bold">
              ⎇
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider flex items-center gap-2">
                Control de Versiones &amp; Backups
              </h3>
              <p className="text-[11px] text-[#9CA1A8] font-sans">
                Datos reales del repo y del pin MPT. Sin staging/rollback ficticios.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA1A8] hover:text-[#E5E5E5] p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Cerrar"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">

          {/* Stack real del repo (TASK §18). */}
          <section
            aria-label="Stack real del repositorio"
            className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4"
          >
            <header className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-[#9CA1A8] uppercase tracking-wider">
                Stack real del repositorio
              </h4>
              {stack?.mode && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                  style={{ background: 'rgba(34, 197, 94,0.10)', color: 'var(--color-brand)', border: '1px solid rgba(34, 197, 94,0.30)' }}
                  aria-label={`Modo ${stack.mode}`}
                >
                  {stack.mode}
                </span>
              )}
            </header>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
              <div>
                <dt className="text-[#6B7076]">Versión del panel</dt>
                <dd className="text-[#E5E5E5]">{package_version ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[#6B7076]">git SHA (corto)</dt>
                <dd className="text-[#E5E5E5]">{git_sha ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[#6B7076]">Modo runtime</dt>
                <dd className="text-[#E5E5E5]">{stack?.mode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[#6B7076]">Contenedores</dt>
                <dd className="text-[#E5E5E5]">{stack?.containers?.length ?? 0}</dd>
              </div>
              <div className="col-span-2 mt-2 pt-2 border-t border-[#2A2C30]">
                <dt className="text-[#6B7076]">MoneyPrinterTurbo upstream pin</dt>
                <dd className="text-[#E5E5E5]">
                  {mpt_pinned_version ?? '—'} · <span className="text-[10px] text-[#7E8590]">{mpt_pinned_sha ?? '—'}</span>
                </dd>
              </div>
            </dl>
            {stack?.containers && stack.containers.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-[#6B7076] mb-1">Contenedores activos</div>
                <ul className="space-y-0.5 text-[11px] font-mono">
                  {stack.containers.map((c) => (
                    <li key={c.name}>
                      <span className="text-[#22C55E]">●</span> {c.name} <span className="text-[#7E8590]">{c.status}</span> <span className="text-[#6B7076]">{c.ports}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stack?.native && stack.native.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-[#6B7076] mb-1">Procesos nativos</div>
                <ul className="space-y-0.5 text-[11px] font-mono">
                  {stack.native.map((line, i) => (
                    <li key={i}><span className="text-[#22C55E]">●</span> {line}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Export Quick Bar — botón real de backup cifrado */}
          <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-[#E5E5E5] text-xs block">Exportación Completa del Sistema</span>
              <span className="text-[11px] text-[#9CA1A8] font-sans">
                Backup cifrado (.pfbackup) — la passphrase es necesaria para restaurar.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportEncrypted}
                className="px-3 py-1.5 bg-[#33363A] hover:bg-[#3A3D42] border border-[#A1A6AE]/30 text-[#A1A6AE] rounded-lg font-bold flex items-center gap-1.5"
                title="Exporta un backup CIFRADO (.pfbackup) con passphrase — nunca JSON en claro"
              >
                Backup cifrado (.pfbackup)
              </button>
              <button
                onClick={onDownloadZip}
                className="px-3.5 py-1.5 bg-[#22C55E] hover:bg-[#22C55E]/90 text-[#0A0A0B] font-bold rounded-lg flex items-center gap-1.5"
              >
                Descargar ZIP Full
              </button>
            </div>
          </div>

          {/* Sin historial ficticio (TASK §30). */}
          <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4">
            <h4 className="text-xs font-bold text-[#9CA1A8] uppercase tracking-wider mb-2">
              Gestión de versiones
            </h4>
            <p className="text-[11px] text-[#9CA1A8] font-sans mb-3">
              Esta UI <strong>NO</strong> simula un historial de versiones ni
              expone un rollback ficticio. Para revertir o comparar, usa{' '}
              <code className="text-[#22C55E]">git log</code>,{' '}
              <code className="text-[#22C55E]">git checkout &lt;sha&gt;</code> o{' '}
              <code className="text-[#22C55E]">git diff</code> directamente en
              el repositorio. Ver{' '}
              <a className="text-[#22C55E] underline" href="https://github.com/SyST3MH4CCH1/phone-farm-platform" target="_blank" rel="noreferrer">
                repo en GitHub
              </a>{' '}
              para el historial real.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setSelectedVersion('current')}
                className="px-2.5 py-1 rounded border"
                style={{
                  background: selectedVersion === 'current' ? 'var(--color-surface-3)' : 'transparent',
                  borderColor: selectedVersion === 'current' ? 'var(--color-line)' : 'transparent',
                  color: selectedVersion === 'current' ? 'var(--color-text)' : 'var(--color-muted-2)',
                }}
                aria-pressed={selectedVersion === 'current'}
              >
                HEAD actual
              </button>
              <button
                type="button"
                onClick={() => setSelectedVersion('export')}
                className="px-2.5 py-1 rounded border"
                style={{
                  background: selectedVersion === 'export' ? 'var(--color-surface-3)' : 'transparent',
                  borderColor: selectedVersion === 'export' ? 'var(--color-line)' : 'transparent',
                  color: selectedVersion === 'export' ? 'var(--color-text)' : 'var(--color-muted-2)',
                }}
                aria-pressed={selectedVersion === 'export'}
              >
                Backup exportable (.pfbackup)
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};