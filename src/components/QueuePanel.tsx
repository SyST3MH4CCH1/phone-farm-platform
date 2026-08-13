import React, { useState } from 'react';
import { QueueJob, Account } from '../types';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) return;
    onAddJob(keywordInput.trim(), targetAccount);
    setKeywordInput('');
  };

  const getStatusText = (status: QueueJob['status']) => {
    switch (status) {
      case 'published': return <span className="text-[#6FBF73]">publicado</span>;
      case 'generating': return <span className="text-[#A1A6AE]">generando IA...</span>;
      case 'awaiting_manual_upload': return <span className="text-[#D4A84B]" title="Instagram Challenge! Copiado a /sdcard/Download vía ADB">fallback ADB push</span>;
      case 'failed': return <span className="text-[#E05B5B]">error</span>;
      case 'awaiting_approval': return <span className="text-[#D4A84B]">revisión</span>;
      case 'rejected': return <span className="text-[#E05B5B]">rechazado</span>;
      case 'awaiting_preview': return <span className="text-[#6FBF73]">vídeo listo — preview</span>;
      case 'ready_for_publish': return <span className="text-[#8FBF6F]">listo para publicar</span>;
      case 'publishing': return <span className="text-[#A1A6AE]">publicando...</span>;
      case 'scripting': return <span className="text-[#A1A6AE]">guión...</span>;
      default: return <span className="text-[#6B7076]">pendiente</span>;
    }
  };

  const btnBase = 'px-2 py-1 rounded-md text-[11px] font-bold transition-colors border border-[#2A2C30]';

  return (
    <div className="bg-[#1E2023] border border-[#2A2C30] rounded-lg flex flex-col h-full overflow-hidden">
      {/* Panel Header */}
      <div className="bg-[#232528] px-4 py-3 border-b border-[#2A2C30] flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-[#E5E5E5] uppercase tracking-wider font-mono">
          Cola de Producción <span className="text-[#6B7076]">({queue.length})</span>
        </h2>
        <button
          onClick={onProcessNextJob}
          disabled={isProcessing || queue.filter(j => j.status === 'pending').length === 0}
          className="btn-primary text-xs px-3.5 py-1.5 disabled:opacity-40"
        >
          {isProcessing ? 'Generando Reels...' : 'Generar Siguiente'}
        </button>
      </div>

      {/* Add Keyword Form */}
      <div className="p-3 bg-[#1A1C1E] border-b border-[#2A2C30]">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 font-mono">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Keyword para el reel (ej: organizar escritorio)"
            className="input flex-1 min-w-[220px] px-3 py-2 text-xs"
          />
          <select
            value={targetAccount}
            onChange={(e) => setTargetAccount(e.target.value)}
            className="input w-48 px-3 py-2 text-xs"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>@{acc.username}</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary px-3 py-2 text-xs">Encolar</button>
        </form>
      </div>

      {/* Queue Table */}
      <div className="flex-1 overflow-y-auto p-3">
        {queue.length === 0 && (
          <div className="border border-dashed border-[#2A2C30] rounded-lg px-4 py-10 text-center">
            <p className="text-xs text-[#9CA1A8] font-mono mb-1">No hay trabajos en la cola</p>
            <p className="text-[11px] text-[#6B7076] font-sans">
              Escribe una keyword arriba y presiona «Encolar».
            </p>
          </div>
        )}
        {queue.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead>
            <tr className="border-b border-[#2A2C30] text-[#6B7076] font-bold uppercase text-[10px] tracking-wider">
              <th className="py-2 px-3">Job</th>
              <th className="py-2 px-3">Keyword</th>
              <th className="py-2 px-3">Cuenta</th>
              <th className="py-2 px-3">Estado</th>
              <th className="py-2 px-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2C30]">
            {queue.map((job) => {
              const acc = accounts.find(a => a.id === job.target_account);
              return (
                <tr key={job.id} className="hover:bg-[#1A1C1E] transition-colors">
                  <td className="py-2 px-3 font-bold text-[#8A8F98]">{job.id}</td>
                  <td className="py-2 px-3 text-[#E5E5E5] cursor-pointer" onClick={() => onOpenPreview && onOpenPreview(job)}>
                    {job.keyword}
                  </td>
                  <td className="py-2 px-3 text-[#9CA1A8] cursor-pointer" onClick={() => onOpenPreview && onOpenPreview(job)}>
                    @{acc ? acc.username : job.target_account}
                  </td>
                  <td className="py-2 px-3">{getStatusText(job.status)}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {job.status === 'awaiting_approval' && onApproveJob && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onApproveJob(job.id); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#A1A6AE]`} title="Aprobar guión -> generar vídeo">
                          Aprobar
                        </button>
                      )}
                      {job.status === 'awaiting_approval' && onRejectJob && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onRejectJob(job.id); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#E05B5B]`} title="Rechazar guión">
                          Rechazar
                        </button>
                      )}
                      {job.status === 'awaiting_preview' && onMarkReady && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onMarkReady(job.id); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#A1A6AE]`} title="Marcar el vídeo como listo para publicar (lo publica un admin)">
                          Listo
                        </button>
                      )}
                      {job.status === 'ready_for_publish' && onPublishJob && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onPublishJob(job.id, job.version || 1); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#6FBF73]`} title="Publicar (admin; requiere confirmación y versión esperada)">
                          Publicar
                        </button>
                      )}
                      {job.status === 'awaiting_preview' && onRejectJob && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onRejectJob(job.id); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#E05B5B]`} title="Rechazar vídeo">
                          Rechazar
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (onOpenPreview) onOpenPreview(job); }}
                        className={`${btnBase} bg-[#33363A] hover:bg-[#3A3D42] text-[#A1A6AE]`} title="Previsualizar Reel 9:16">
                        Ver
                      </button>
                      {onDeleteJob && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteJob(job.id); }}
                          className={`${btnBase} bg-[#232528] hover:bg-[#2A2C30] text-[#6B7076]`} title="Eliminar de la cola">
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </div>
  );
};
