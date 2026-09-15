import React, { useState } from 'react';
import { QueueJob, Account } from '../types';
import { MoreHorizontal } from 'lucide-react';

interface QueuePanelProps {
  queue: QueueJob[];
  accounts: Account[];
  onAddJob: (keyword: string, targetAccount: string) => void;
  onProcessNextJob: () => void;
  isProcessing: boolean;
  onOpenPreview?: (job: QueueJob) => void;
  onApproveJob?: (jobId: string) => void;
  onPublishJob?: (jobId: string, version: number) => void;
  onMarkReady?: (jobId: string) => void;
  onRejectJob?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  accounts,
  onAddJob,
  onProcessNextJob,
  isProcessing,
  onOpenPreview,
  onApproveJob,
  onPublishJob,
  onMarkReady,
  onRejectJob,
  onDeleteJob
}) => {
  const [keywordInput, setKeywordInput] = useState('');
  const [targetAccount, setTargetAccount] = useState(accounts[0]?.id || 'acc_01');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) return;
    onAddJob(keywordInput.trim(), targetAccount);
    setKeywordInput('');
  };

  const getStatusPill = (status: QueueJob['status']) => {
    switch (status) {
      case 'published':
        return <span className="status-pill ok"><span className="dot" />publicado</span>;
      case 'generating':
        return <span className="status-pill info"><span className="dot" />generando</span>;
      case 'awaiting_manual_upload':
        return <span className="status-pill warn"><span className="dot" />fallback ADB</span>;
      case 'failed':
        return <span className="status-pill danger"><span className="dot" />error</span>;
      case 'awaiting_approval':
        return <span className="status-pill warn"><span className="dot" />revisión</span>;
      case 'rejected':
        return <span className="status-pill danger"><span className="dot" />rechazado</span>;
      case 'awaiting_preview':
        return <span className="status-pill ok"><span className="dot" />preview</span>;
      case 'ready_for_publish':
        return <span className="status-pill ok"><span className="dot" />listo</span>;
      case 'publishing':
        return <span className="status-pill info"><span className="dot" />publicando</span>;
      case 'scripting':
        return <span className="status-pill info"><span className="dot" />guión</span>;
      default:
        return <span className="status-pill info"><span className="dot" />pendiente</span>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)' }}>
      {/* Panel Header */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2" style={{ background: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-line)' }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--color-text)' }}>
          Cola <span style={{ color: 'var(--color-muted-2)' }}>({queue.length})</span>
        </h2>
        <button
          onClick={onProcessNextJob}
          disabled={isProcessing || queue.filter(j => j.status === 'pending').length === 0}
          className="btn-brand text-xs px-3 py-1 disabled:opacity-40"
        >
          {isProcessing ? 'Generando...' : 'Generar Siguiente'}
        </button>
      </div>

      {/* Add Keyword Form — single line */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 font-mono">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="keyword para el reel..."
            className="input flex-1 min-w-[160px] px-3 py-1.5 text-[11px]"
            aria-label="Keyword para nuevo reel"
          />
          <select
            value={targetAccount}
            onChange={(e) => setTargetAccount(e.target.value)}
            className="input w-36 px-2 py-1.5 text-[11px]"
            aria-label="Cuenta destino"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>@{acc.username}</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary text-[11px] px-3 py-1.5">Encolar</button>
        </form>
      </div>

      {/* Queue Table */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-lg font-mono font-bold" style={{ color: 'var(--color-muted)' }}>
              &gt; Cola vacía — Encolar primer job ↓
            </p>
          </div>
        )}
        {queue.length > 0 && (
          <table className="w-full text-left text-[11px] border-collapse font-mono">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface-3)' }}>
              <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-muted-2)' }}>
                <th className="px-3 py-2 font-bold">Job</th>
                <th className="px-3 py-2 font-bold">Keyword</th>
                <th className="px-3 py-2 font-bold">Cuenta</th>
                <th className="px-3 py-2 font-bold">Estado</th>
                <th className="px-3 py-2 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((job) => {
                const acc = accounts.find(a => a.id === job.target_account);
                return (
                  <tr
                    key={job.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--color-line)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--color-muted)' }}>{job.id}</td>
                    <td
                      className="px-3 py-2 cursor-pointer"
                      style={{ color: 'var(--color-text)' }}
                      onClick={() => onOpenPreview && onOpenPreview(job)}
                    >
                      {job.keyword}
                    </td>
                    <td
                      className="px-3 py-2 cursor-pointer"
                      style={{ color: 'var(--color-muted)' }}
                      onClick={() => onOpenPreview && onOpenPreview(job)}
                    >
                      @{acc ? acc.username : job.target_account}
                    </td>
                    <td className="px-3 py-2">{getStatusPill(job.status)}</td>
                    <td className="px-3 py-2 text-right">
                      {/* Dropdown menu ⋯ */}
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === job.id ? null : job.id); }}
                          className="p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors"
                          style={{ color: 'var(--color-muted)' }}
                          aria-label="Menú de acciones"
                          aria-haspopup="true"
                          aria-expanded={openMenu === job.id}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenu === job.id && (
                          <div
                            className="absolute right-0 top-full mt-1 py-1 z-20 min-w-[120px] rounded-lg"
                            style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-line)' }}
                            role="menu"
                          >
                            {onOpenPreview && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onOpenPreview(job); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-text)' }}
                                role="menuitem"
                              >
                                Ver
                              </button>
                            )}
                            {job.status === 'awaiting_approval' && onApproveJob && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onApproveJob(job.id); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-ok)' }}
                                role="menuitem"
                              >
                                Aprobar
                              </button>
                            )}
                            {job.status === 'awaiting_approval' && onRejectJob && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRejectJob(job.id); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-danger)' }}
                                role="menuitem"
                              >
                                Rechazar
                              </button>
                            )}
                            {job.status === 'ready_for_publish' && onPublishJob && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPublishJob(job.id, job.version || 1); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-ok)' }}
                                role="menuitem"
                              >
                                Publicar
                              </button>
                            )}
                            {onDeleteJob && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteJob(job.id); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-danger)' }}
                                role="menuitem"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
