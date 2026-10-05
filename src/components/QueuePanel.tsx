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
  embedded?: boolean;
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
  embedded = false,
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

  if (embedded) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)' }}>
        {/* Panel Header */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-line)' }}>
          <h2 className="text-[11px] font-bold uppercase tracking-wider font-mono text-white">
            Cola <span style={{ color: 'var(--color-muted)' }}>({queue.length})</span>
          </h2>
          <button
            onClick={onProcessNextJob}
            disabled={isProcessing}
            className="btn-brand text-[10px] px-2.5 py-1 font-semibold flex items-center gap-1"
          >
            {isProcessing ? 'Generando...' : 'Generar Siguiente'}
          </button>
        </div>

        {/* Input Bar */}
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface-2)' }}>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="keyword para el reel"
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-line)] rounded px-2.5 py-1 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-[#3b82f6]"
            />
            <select
              value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3 py-1 rounded text-xs font-mono font-medium border border-[var(--color-line)] bg-[var(--color-surface-3)] text-gray-200 hover:bg-[var(--color-surface-4)] flex items-center gap-1 shrink-0"
            >
              Encolar ▾
            </button>
          </form>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-[10px] font-mono uppercase tracking-wider text-[#64748b]" style={{ borderColor: 'var(--color-line)' }}>
                <th className="py-2 px-3 font-semibold">JOB</th>
                <th className="py-2 px-2 font-semibold">KEYWORD</th>
                <th className="py-2 px-2 font-semibold">CUENTA</th>
                <th className="py-2 px-2 font-semibold text-center">ESTADO</th>
                <th className="py-2 px-3 font-semibold text-right">PROGRESO</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((job) => {
                const isReview = job.status === 'awaiting_approval' || job.status === 'awaiting_preview' || job.status === 'ready_for_publish';
                const isGenerating = job.status === 'generating' || job.status === 'scripting';
                const isPublished = job.status === 'published';
                const isFallback = job.status === 'awaiting_manual_upload';
                const statusBadge = isReview ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#2a2008] text-[#fbbf24] border border-[#713f12]/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
                    revisión
                  </span>
                ) : isGenerating ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#0c2340] text-[#38bdf8] border border-[#0369a1]/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
                    generando
                  </span>
                ) : isPublished ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#0a2916] text-[#22c55e] border border-[#14532d]/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                    publicado
                  </span>
                ) : isFallback ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] leading-[12px] font-mono bg-[#2b1805] text-[#fbbf24] border border-[#78350f]/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] shrink-0" />
                    <span>fallback<br />ADB</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#2b1805] text-[#f59e0b] border border-[#78350f]/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                    {job.status === 'pending' ? 'en cola' : job.status === 'failed' ? 'error' : job.status.replaceAll('_', ' ')}
                  </span>
                );

                const progressPct = typeof job.progress === 'number' ? job.progress : (isPublished ? 100 : null);
                const accountName = accounts.find((a) => a.id === job.target_account)?.username ?? job.target_account;

                return (
                  <tr
                    key={job.id}
                    className="border-b transition-colors hover:bg-[var(--color-surface-2)] text-xs font-mono"
                    style={{ borderColor: 'var(--color-line)' }}
                  >
                    <td className="py-2.5 px-3 text-[#9aafc5] font-semibold whitespace-nowrap">
                      {job.id.startsWith('job_') ? job.id : `job_${job.id}`}
                    </td>
                    <td className="py-2.5 px-2 text-white font-medium max-w-[130px] truncate" title={job.keyword || ''}>
                      {job.keyword || '—'}
                    </td>
                    <td className="py-2.5 px-2 text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={`@${accountName}`}>
                      @{accountName}
                    </td>
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      {statusBadge}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-gray-300 font-semibold tabular-nums text-[11px]">{progressPct === null ? '—' : `${progressPct}%`}</span>
                        <div className="w-16 h-1.5 rounded-full bg-[#1c2633] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progressPct ?? 0}%`,
                              background: isFallback ? 'linear-gradient(to right, #d99000, #fbbf24)' : 'linear-gradient(to right, #2563eb, #38bdf8)'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#9aafc5] font-mono">
                    Cola vacía. Usa el formulario de arriba para encolar un reel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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
