import React from 'react';
import { StatusBadge, StatusBadgeKind } from './StatusBadge';

/**
 * JobProgress — TASK §22.2.
 * Barra horizontal + etapa actual + porcentaje. Mapeo de 11 estados reales
 * a 5 buckets visuales (Queued/Ready/Publishing/Completed/Failed) +
 * sub-estado Generating para jobs en curso.
 *
 * Ver docs/audits/UI_REDESIGN_REALITY_AUDIT.md §6 y COVERAGE_MATRIX §11.1.
 */

export type QueueJobStatus =
  | 'pending' | 'scripting' | 'generating' | 'awaiting_approval' | 'awaiting_preview'
  | 'ready_for_publish' | 'publishing' | 'published' | 'failed' | 'rejected'
  | 'awaiting_manual_upload';

export interface JobProgressProps {
  status: QueueJobStatus;
  /** 0–100. Si null, no se muestra porcentaje (estado terminal sin progreso numérico). */
  progress?: number | null;
  /** Etapa libre que aparece en jobs activos. */
  stage?: string;
}

interface StageMeta {
  kind: StatusBadgeKind;
  label: string;
  bucket: 'queued' | 'generating' | 'ready' | 'publishing' | 'completed' | 'failed';
  bucketLabel: string;
  bar: number; // 0–100 width
  color: string;
}

const STAGE_META: Record<QueueJobStatus, StageMeta> = {
  pending: { kind: 'paused', label: 'Queued', bucket: 'queued', bucketLabel: 'Queued', bar: 5, color: 'var(--color-muted-2)' },
  scripting: { kind: 'ai', label: 'Scripting', bucket: 'generating', bucketLabel: 'Generating', bar: 30, color: 'var(--color-ai)' },
  generating: { kind: 'ai', label: 'Generating', bucket: 'generating', bucketLabel: 'Generating', bar: 60, color: 'var(--color-ai)' },
  awaiting_approval: { kind: 'warn', label: 'Awaiting approval', bucket: 'generating', bucketLabel: 'Generating (awaiting review)', bar: 80, color: 'var(--color-warn)' },
  awaiting_preview: { kind: 'warn', label: 'Awaiting preview', bucket: 'generating', bucketLabel: 'Generating (awaiting preview)', bar: 80, color: 'var(--color-warn)' },
  ready_for_publish: { kind: 'ok', label: 'Ready to publish', bucket: 'ready', bucketLabel: 'Ready', bar: 90, color: 'var(--color-ok)' },
  publishing: { kind: 'running', label: 'Publishing', bucket: 'publishing', bucketLabel: 'Publishing', bar: 95, color: 'var(--color-info)' },
  published: { kind: 'ok', label: 'Published', bucket: 'completed', bucketLabel: 'Completed', bar: 100, color: 'var(--color-ok)' },
  failed: { kind: 'danger', label: 'Failed', bucket: 'failed', bucketLabel: 'Failed', bar: 100, color: 'var(--color-danger)' },
  rejected: { kind: 'danger', label: 'Rejected', bucket: 'failed', bucketLabel: 'Failed', bar: 100, color: 'var(--color-danger)' },
  awaiting_manual_upload: { kind: 'warn', label: 'Awaiting manual upload', bucket: 'failed', bucketLabel: 'Failed (manual action needed)', bar: 100, color: 'var(--color-warn)' },
};

export const BUCKET_ORDER: StageMeta['bucket'][] = ['queued', 'generating', 'ready', 'publishing', 'completed', 'failed'];

export const JobProgress: React.FC<JobProgressProps> = ({ status, progress, stage }) => {
  const meta = STAGE_META[status];
  const effectiveProgress = typeof progress === 'number' && Number.isFinite(progress) ? progress : meta.bar;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge kind={meta.kind} label={meta.label} dot />
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-muted-2)' }} title={meta.bucketLabel}>
          {stage ?? meta.bucketLabel}
        </span>
      </div>
      <div
        className="w-full h-1 rounded overflow-hidden"
        style={{ background: 'var(--color-surface-2)' }}
        role="progressbar"
        aria-valuenow={Math.round(effectiveProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress ${Math.round(effectiveProgress)}%`}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%`, background: meta.color }}
        />
      </div>
    </div>
  );
};