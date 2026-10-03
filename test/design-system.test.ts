import { describe, it, expect } from 'vitest';
import {
  STAGE_META_FROM_STATUS,
  bucketForStatus,
  BUCKET_ORDER,
  isTerminalState,
  isActiveState,
} from '../src/components/design/_mapping';
import {
  formatPercent,
  formatLatency,
  formatBytes,
  formatRelativeTime,
  formatTimestamp,
} from '../src/components/design/_formatters';
import { classifyMetric, MetricClass } from '../src/components/design/_metricClass';

describe('design system — TASK §22 mappers', () => {
  describe('JobProgress mapping (QueueJobStatus → bucket + meta)', () => {
    it('pending → Queued bucket', () => {
      expect(bucketForStatus('pending')).toBe('queued');
    });
    it('scripting/generating/awaiting_approval/awaiting_preview → Generating bucket', () => {
      expect(bucketForStatus('scripting')).toBe('generating');
      expect(bucketForStatus('generating')).toBe('generating');
      expect(bucketForStatus('awaiting_approval')).toBe('generating');
      expect(bucketForStatus('awaiting_preview')).toBe('generating');
    });
    it('ready_for_publish → Ready', () => {
      expect(bucketForStatus('ready_for_publish')).toBe('ready');
    });
    it('publishing → Publishing', () => {
      expect(bucketForStatus('publishing')).toBe('publishing');
    });
    it('published → Completed', () => {
      expect(bucketForStatus('published')).toBe('completed');
    });
    it('failed/rejected/awaiting_manual_upload → Failed bucket', () => {
      expect(bucketForStatus('failed')).toBe('failed');
      expect(bucketForStatus('rejected')).toBe('failed');
      expect(bucketForStatus('awaiting_manual_upload')).toBe('failed');
    });
    it('bucket order Queued → Generating → Ready → Publishing → Completed → Failed', () => {
      expect(BUCKET_ORDER).toEqual(['queued', 'generating', 'ready', 'publishing', 'completed', 'failed']);
    });
    it('all 11 estados reales del tipo QueueJob.status del repo están clasificados', () => {
      const estados = [
        'pending', 'scripting', 'generating', 'awaiting_approval', 'awaiting_preview',
        'ready_for_publish', 'publishing', 'published', 'failed', 'rejected',
        'awaiting_manual_upload',
      ] as const;
      for (const s of estados) {
        expect(STAGE_META_FROM_STATUS[s]).toBeDefined();
        expect(STAGE_META_FROM_STATUS[s].label).toBeTruthy();
      }
    });
  });

  describe('terminal vs active states (Pipeline UX)', () => {
    it('published es terminal', () => {
      expect(isTerminalState('published')).toBe(true);
    });
    it('failed / rejected son terminal', () => {
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('rejected')).toBe(true);
    });
    it('pending / scripting / generating están activos', () => {
      expect(isActiveState('pending')).toBe(true);
      expect(isActiveState('scripting')).toBe(true);
      expect(isActiveState('generating')).toBe(true);
    });
    it('published NO está activo', () => {
      expect(isActiveState('published')).toBe(false);
    });
  });
});

describe('design system — TASK §22 formatters', () => {
  describe('formatPercent', () => {
    it('redondea a entero por defecto', () => {
      expect(formatPercent(87.6)).toBe('88%');
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(100)).toBe('100%');
    });
    it('acepta dígitos personalizados', () => {
      expect(formatPercent(87.634, 2)).toBe('87.63%');
    });
    it('rechaza null/undefined/NaN/Infinity → em-dash', () => {
      expect(formatPercent(null)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
      expect(formatPercent(NaN)).toBe('—');
      expect(formatPercent(Infinity)).toBe('—');
    });
    it('clamp a 0-100', () => {
      expect(formatPercent(150)).toBe('100%');
      expect(formatPercent(-5)).toBe('0%');
    });
  });

  describe('formatLatency', () => {
    it('renderiza ms', () => {
      expect(formatLatency(120)).toBe('120 ms');
      expect(formatLatency(0)).toBe('0 ms');
    });
    it('renderiza en segundos cuando >= 1000', () => {
      expect(formatLatency(1500)).toBe('1.50 s');
      expect(formatLatency(60_000)).toBe('60.00 s');
    });
    it('rechaza NaN/null → em-dash', () => {
      expect(formatLatency(NaN)).toBe('—');
      expect(formatLatency(null)).toBe('—');
    });
  });

  describe('formatBytes', () => {
    it('B → KB → MB → GB', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(5_242_880)).toBe('5.0 MB');
      expect(formatBytes(5_368_709_120)).toBe('5.0 GB');
    });
    it('null/undefined/0 → em-dash para 0', () => {
      expect(formatBytes(0)).toBe('—');
      expect(formatBytes(null)).toBe('—');
    });
  });

  describe('formatRelativeTime', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    it('hace 5 s → "hace 5s"', () => {
      const t = new Date(now.getTime() - 5_000).toISOString();
      expect(formatRelativeTime(t, now)).toBe('hace 5s');
    });
    it('hace 2 min → "hace 2min"', () => {
      const t = new Date(now.getTime() - 120_000).toISOString();
      expect(formatRelativeTime(t, now)).toBe('hace 2min');
    });
    it('futuro 1h → "en 1h"', () => {
      const t = new Date(now.getTime() + 3_600_000).toISOString();
      expect(formatRelativeTime(t, now)).toBe('en 1h');
    });
  });

  describe('formatTimestamp', () => {
    it('YYYY-MM-DD HH:MM:SS ISO-like', () => {
      const t = new Date('2026-10-03T12:34:56Z');
      // timezone-dependent; assert key parts
      const out = formatTimestamp(t);
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
    it('null/undefined → em-dash', () => {
      expect(formatTimestamp(null)).toBe('—');
      expect(formatTimestamp(undefined)).toBe('—');
    });
  });
});

describe('design system — TASK §6 metric classifier', () => {
  it('CPU/RAM/disk son REAL (psutil)', () => {
    expect(classifyMetric('system.cpu_percent')).toBe<MetricClass>('REAL');
    expect(classifyMetric('system.ram_percent')).toBe<MetricClass>('REAL');
    expect(classifyMetric('system.disk_percent')).toBe<MetricClass>('REAL');
  });
  it('devices.online_count es REAL', () => {
    expect(classifyMetric('devices.online_count')).toBe<MetricClass>('REAL');
  });
  it('runtime_p50/p95/wait_p50/p95 son DERIVED (futuro)', () => {
    expect(classifyMetric('queue.runtime_p50_s')).toBe<MetricClass>('DERIVED');
    expect(classifyMetric('queue.runtime_p95_s')).toBe<MetricClass>('DERIVED');
    expect(classifyMetric('queue.wait_p50_s')).toBe<MetricClass>('DERIVED');
    expect(classifyMetric('queue.wait_p95_s')).toBe<MetricClass>('DERIVED');
  });
  it('accounts.followers_count sigue UNAVAILABLE (no se calcula)', () => {
    expect(classifyMetric('accounts.followers_count')).toBe<MetricClass>('UNAVAILABLE');
  });
  it('mpt.cost_usd sigue UNAVAILABLE (no hay tabla de precios)', () => {
    expect(classifyMetric('mpt.cost_usd')).toBe<MetricClass>('UNAVAILABLE');
  });
  it('proxy.health_check_success_rate sigue UNAVAILABLE (sin histórico)', () => {
    expect(classifyMetric('proxy.health_check_success_rate')).toBe<MetricClass>('UNAVAILABLE');
  });
});