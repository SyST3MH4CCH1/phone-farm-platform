// TASK §22 + §11 — mapping de QueueJob.status a buckets de pipeline visual.
// 11 estados reales del repo → 6 buckets UI (Queued/Generating/Ready/Publishing/Completed/Failed).
// Sub-estados dentro de Generating se distinguen en `label`.

import type { StatusBadgeKind } from './StatusBadge';

export type QueueJobStatus =
  | 'pending' | 'scripting' | 'generating' | 'awaiting_approval' | 'awaiting_preview'
  | 'ready_for_publish' | 'publishing' | 'published' | 'failed' | 'rejected'
  | 'awaiting_manual_upload';

export type JobBucket = 'queued' | 'generating' | 'ready' | 'publishing' | 'completed' | 'failed';

export interface StageMeta {
  kind: StatusBadgeKind;
  label: string;
  bucket: JobBucket;
  bucketLabel: string;
  bar: number; // 0–100
  color: string;
}

export const STAGE_META_FROM_STATUS: Record<QueueJobStatus, StageMeta> = {
  pending: { kind: 'paused', label: 'Queued', bucket: 'queued', bucketLabel: 'Queued', bar: 5, color: 'var(--color-muted-2)' },
  scripting: { kind: 'running', label: 'Scripting', bucket: 'generating', bucketLabel: 'Generating', bar: 30, color: 'var(--color-brand)' },
  generating: { kind: 'running', label: 'Generating', bucket: 'generating', bucketLabel: 'Generating', bar: 60, color: 'var(--color-brand)' },
  awaiting_approval: { kind: 'warn', label: 'Awaiting approval', bucket: 'generating', bucketLabel: 'Generating (awaiting review)', bar: 80, color: 'var(--color-warn)' },
  awaiting_preview: { kind: 'warn', label: 'Awaiting preview', bucket: 'generating', bucketLabel: 'Generating (awaiting preview)', bar: 80, color: 'var(--color-warn)' },
  ready_for_publish: { kind: 'ok', label: 'Ready to publish', bucket: 'ready', bucketLabel: 'Ready', bar: 90, color: 'var(--color-ok)' },
  publishing: { kind: 'running', label: 'Publishing', bucket: 'publishing', bucketLabel: 'Publishing', bar: 95, color: 'var(--color-info)' },
  published: { kind: 'ok', label: 'Published', bucket: 'completed', bucketLabel: 'Completed', bar: 100, color: 'var(--color-ok)' },
  failed: { kind: 'danger', label: 'Failed', bucket: 'failed', bucketLabel: 'Failed', bar: 100, color: 'var(--color-danger)' },
  rejected: { kind: 'danger', label: 'Rejected', bucket: 'failed', bucketLabel: 'Failed', bar: 100, color: 'var(--color-danger)' },
  awaiting_manual_upload: { kind: 'warn', label: 'Awaiting manual upload', bucket: 'failed', bucketLabel: 'Failed (manual action needed)', bar: 100, color: 'var(--color-warn)' },
};

export function bucketForStatus(status: QueueJobStatus): JobBucket {
  return STAGE_META_FROM_STATUS[status].bucket;
}

export const BUCKET_ORDER: JobBucket[] = ['queued', 'generating', 'ready', 'publishing', 'completed', 'failed'];

/** Estados terminales (no más transiciones): published, failed, rejected. awaiting_manual_upload NO es terminal — puede reintentar. */
const TERMINAL: ReadonlySet<QueueJobStatus> = new Set<QueueJobStatus>(['published', 'failed', 'rejected']);
const ACTIVE: ReadonlySet<QueueJobStatus> = new Set<QueueJobStatus>([
  'pending', 'scripting', 'generating', 'awaiting_approval', 'awaiting_preview',
  'ready_for_publish', 'publishing',
]);

export function isTerminalState(status: QueueJobStatus): boolean {
  return TERMINAL.has(status);
}

export function isActiveState(status: QueueJobStatus): boolean {
  return ACTIVE.has(status);
}