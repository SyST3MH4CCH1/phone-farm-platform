import React, { useState } from 'react';
import { QueueJob, Account } from '../types';
import { Video, Play, Plus, Film, CheckCircle2, AlertTriangle, Loader2, Sparkles, Send } from 'lucide-react';

interface QueuePanelProps {
  queue: QueueJob[];
  accounts: Account[];
  onAddJob: (keyword: string, targetAccount: string) => void;
  onProcessNextJob: () => void;
  isProcessing: boolean;
  onOpenPreview?: (job: QueueJob) => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  accounts,
  onAddJob,
  onProcessNextJob,
  isProcessing,
  onOpenPreview
}) => {
  const [keywordInput, setKeywordInput] = useState('');
  const [targetAccount, setTargetAccount] = useState(accounts[0]?.id || 'acc_01');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) return;
    onAddJob(keywordInput.trim(), targetAccount);
    setKeywordInput('');
  };

  const getStatusBadge = (status: QueueJob['status']) => {
    switch (status) {
      case 'published':
        return (
          <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full text-[11px] font-mono inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Publicado
          </span>
        );
      case 'generating':
        return (
          <span className="bg-blue-950/80 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full text-[11px] font-mono inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" /> Generando IA...
          </span>
        );
      case 'awaiting_manual_upload':
        return (
          <span className="bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30 px-2 py-0.5 rounded-full text-[11px] font-mono inline-flex items-center gap-1" title="Instagram Challenge! Copiado a /sdcard/Download vía ADB">
            <AlertTriangle className="w-3 h-3 text-[#38BDF8]" /> Fallback ADB Push
          </span>
        );
      case 'failed':
        return (
          <span className="bg-red-950/80 text-red-300 border border-red-800 px-2 py-0.5 rounded-full text-[11px] font-mono inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-400" /> Error
          </span>
        );
      default:
        return (
          <span className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full text-[11px] font-mono">
            Pendiente
          </span>
        );
    }
  };

  return (
    <div className="bg-[#101A2D] border border-[#1E2C42] rounded-xl flex flex-col h-full overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="bg-[#0F1829] px-4 py-3 border-b border-[#1E2C42] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-[#00E5BE]" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Cola de Producción IA & Publicación <span className="text-[#00E5BE]">({queue.length})</span>
          </h2>
        </div>

        <button
          onClick={onProcessNextJob}
          disabled={isProcessing || queue.filter(j => j.status === 'pending').length === 0}
          className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 disabled:opacity-40 text-[#090D16] font-bold font-mono text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando Reels...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Generar & Publicar Siguiente
            </>
          )}
        </button>
      </div>

      {/* Add Keyword Form */}
      <div className="p-3 bg-[#0B1320] border-b border-[#1E2C42]">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 font-mono">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Ej: decoracion sala moderna minimalista"
              className="w-full bg-[#101A2D] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#00E5BE] font-sans"
            />
          </div>

          <div className="w-48">
            <select
              value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              className="w-full bg-[#101A2D] border border-[#1E2C42] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00E5BE] font-sans"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="bg-[#1E293B] hover:bg-[#334155] text-[#00E5BE] border border-[#38BDF8]/30 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#00E5BE]" /> Keyword
          </button>
        </form>
      </div>

      {/* Queue Table */}
      <div className="flex-1 overflow-y-auto p-3">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead>
            <tr className="border-b border-[#1E2C42] text-[#94A3B8] font-bold uppercase text-[10px] tracking-wider bg-[#0F1829]">
              <th className="py-2.5 px-3">Job ID</th>
              <th className="py-2.5 px-3">Keyword / Prompt IA</th>
              <th className="py-2.5 px-3">Target IG</th>
              <th className="py-2.5 px-3">Estado</th>
              <th className="py-2.5 px-3 text-right font-bold">Previsualizar Reel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2C42]">
            {queue.map((job) => {
              const acc = accounts.find(a => a.id === job.target_account);
              return (
                <tr key={job.id} className="hover:bg-[#0B1320] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-[#00E5BE]">{job.id}</td>
                  <td className="py-2.5 px-3 text-white cursor-pointer" onClick={() => onOpenPreview && onOpenPreview(job)}>
                    <div className="flex items-center gap-1.5 font-medium hover:text-[#00E5BE] transition-colors">
                      <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
                      {job.keyword}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[#94A3B8] font-sans cursor-pointer" onClick={() => onOpenPreview && onOpenPreview(job)}>
                    @{acc ? acc.username : job.target_account}
                  </td>
                  <td className="py-2.5 px-3">{getStatusBadge(job.status)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenPreview) onOpenPreview(job);
                      }}
                      className="px-2.5 py-1 bg-[#1E293B] hover:bg-[#00E5BE]/20 hover:border-[#00E5BE] border border-[#38BDF8]/40 rounded-lg text-[11px] text-[#38BDF8] hover:text-[#00E5BE] font-bold transition-all inline-flex items-center gap-1 shadow-sm"
                      title="Previsualizar Reel en 9:16 antes de publicar en Instagram / TikTok"
                    >
                      <Film className="w-3 h-3 text-[#00E5BE]" /> Ver Video 9:16
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
