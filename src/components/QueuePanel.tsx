import React, { useState, useMemo } from 'react';
import { QueueJob, Account } from '../types';
import { MoreHorizontal } from 'lucide-react';
import {
  JobProgress, BUCKET_ORDER, bucketForStatus, isActiveState,
  FilterBar, EmptyState, StatusBadge, type QueueJobStatus,
} from './design';

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

type StatusFilter = QueueJobStatus | 'all' | 'active';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'failed', label: 'Fallidos' },
  { value: 'published', label: 'Publicados' },
];

export const QueuePanel: React.FC<QueuePanelProps> = ({
  queue, accounts, onAddJob, onProcessNextJob, isProcessing,
  onOpenPreview, onApproveJob, onPublishJob, onMarkReady, onRejectJob, onDeleteJob,
}) => {
  const [keywordInput, setKeywordInput] = useState('');
  const [targetAccount, setTargetAccount] = useState(accounts[0]?.id || '');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim() || !targetAccount) return;
    onAddJob(keywordInput.trim(), targetAccount);
    setKeywordInput('');
  };

  // Buckets para el header pipeline.
  const bucketCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of BUCKET_ORDER) c[b] = 0;
    for (const job of queue) c[bucketForStatus(job.status)]++;
    return c;
  }, [queue]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue.filter((j) => {
      if (statusFilter === 'active' && !isActiveState(j.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && j.status !== statusFilter) return false;
      if (q) {
        const blob = `${j.id} ${j.target_account} ${j.keyword ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [queue, query, statusFilter]);

  const BUCKET_LABEL: Record<string, { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'paused' | 'running' | 'neutral' | 'ai' }> = {
    queued: { label: 'Queued', kind: 'paused' },
    generating: { label: 'Generating', kind: 'ai' },
    ready: { label: 'Ready', kind: 'ok' },
    publishing: { label: 'Publishing', kind: 'info' },
    completed: { label: 'Completed', kind: 'ok' },
    failed: { label: 'Failed', kind: 'danger' },
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
          disabled={isProcessing || bucketCounts['queued'] === 0}
          className="btn-brand text-xs px-3 py-1 disabled:opacity-40"
        >
          {isProcessing ? 'Generando...' : 'Generar Siguiente'}
        </button>
      </div>

      {/* Pipeline summary */}
      <div
        className="px-4 py-2 flex items-center gap-2 flex-wrap"
        style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-line)' }}
        aria-label="Pipeline summary"
      >
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-muted-2)' }}>Pipeline:</span>
        {BUCKET_ORDER.map((b: string) => (
          <StatusBadge key={b} kind={BUCKET_LABEL[b].kind} label={`${BUCKET_LABEL[b].label} ${bucketCounts[b]}`} dot quiet={bucketCounts[b] === 0} />
        ))}
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}>
        <FilterBar<StatusFilter>
          query={query}
          onQueryChange={setQuery}
          options={STATUS_FILTERS}
          activeOption={statusFilter}
          onActiveOptionChange={setStatusFilter}
          placeholder="Buscar por id, cuenta o keyword…"
        />
      </div>

      {/* Add Keyword Form */}
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
            {accounts.length === 0 && <option value="">Sin cuentas</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>@{acc.username}</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary text-[11px] px-3 py-1.5" disabled={!targetAccount}>
            Encolar
          </button>
        </form>
      </div>

      {/* Queue Table */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 && (
          <EmptyState
            title="Cola vacía"
            description="No hay jobs. Encola el primero usando el formulario de arriba."
          />
        )}
        {queue.length > 0 && filtered.length === 0 && (
          <EmptyState
            title="Sin resultados"
            description={`No hay jobs que coincidan con el filtro "${query || statusFilter}".`}
          />
        )}
        {filtered.length > 0 && (
          <table className="w-full text-left text-[11px] border-collapse font-mono">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface-3)' }}>
              <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-muted-2)' }}>
                <th className="px-3 py-2 font-bold">Job</th>
                <th className="px-3 py-2 font-bold">Keyword</th>
                <th className="px-3 py-2 font-bold">Cuenta</th>
                <th className="px-3 py-2 font-bold" style={{ minWidth: 220 }}>Estado</th>
                <th className="px-3 py-2 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
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
                    <td className="px-3 py-2">
                      <JobProgress status={job.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
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
                            {job.status === 'ready_for_publish' && onMarkReady && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onMarkReady(job.id); setOpenMenu(null); }}
                                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-4)] transition-colors"
                                style={{ color: 'var(--color-info)' }}
                                role="menuitem"
                              >
                                Marcar listo
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