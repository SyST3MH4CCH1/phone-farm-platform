import { describe, it, expect } from 'vitest';
import {
  errorMessageFrom, failedResourceNames, latestUpdatedAt,
  reduceFailure, reduceStart, reduceSuccess,
  type ResourceState,
} from '../src/data/resource';

const idle: ResourceState<number> = { status: 'idle', data: null, error: null, updatedAt: null, isStale: false };
const ready: ResourceState<number> = { status: 'ready', data: 42, error: null, updatedAt: 1000, isStale: false };

describe('TASK §23 — máquina de estados del recurso', () => {
  it('reduceStart: sin datos previos muestra loading; con datos previos no borra nada', () => {
    expect(reduceStart(idle)).toMatchObject({ status: 'loading', data: null, error: null });
    const s = reduceStart(ready);
    expect(s.status).toBe('ready');
    expect(s.data).toBe(42);
  });

  it('reduceSuccess: limpia error previo y marca fresco con timestamp', () => {
    const stale = { ...ready, status: 'stale' as const, error: 'timeout', isStale: true };
    const next = reduceSuccess(stale, 7, 999);
    expect(next).toEqual({ status: 'ready', data: 7, error: null, updatedAt: 999, isStale: false });
  });

  it('reduceFailure SIN datos previos → error duro (la UI puede reintentar)', () => {
    const s = reduceFailure(idle, 'Flask no alcanzable');
    expect(s).toEqual({ status: 'error', data: null, error: 'Flask no alcanzable', updatedAt: null, isStale: false });
  });

  it('reduceFailure CON datos previos → stale: conserva el último valor bueno', () => {
    const s = reduceFailure(ready, '504');
    expect(s.status).toBe('stale');
    expect(s.isStale).toBe(true);
    expect(s.data).toBe(42);
    expect(s.error).toBe('504');
  });

  it('errorMessageFrom usa el mensaje real del backend cuando existe', () => {
    expect(errorMessageFrom(503, { error: 'Backend Flask no alcanzable' })).toBe('Backend Flask no alcanzable');
  });

  it('errorMessageFrom cae al status HTTP si el body no trae error', () => {
    expect(errorMessageFrom(404, null)).toBe('HTTP 404');
    expect(errorMessageFrom(500, { error: '   ' })).toBe('HTTP 500');
    expect(errorMessageFrom(401, { message: 'otra cosa' })).toBe('HTTP 401');
  });

  describe('partial failure en un set de recursos', () => {
    const set: Record<string, ResourceState<number>> = {
      accounts: ready,
      proxies: { status: 'error', data: null, error: 'proxy down', updatedAt: null, isStale: false },
      queue: { ...ready, status: 'stale', error: 'timeout', isStale: true },
      drafts: { status: 'ready', data: 3, error: null, updatedAt: 2000, isStale: false },
    };

    it('lista exactamente los endpoints no frescos', () => {
      expect(failedResourceNames(set).sort()).toEqual(['proxies', 'queue']);
    });

    it('updatedAt es el más reciente entre los válidos, no un reloj de UI', () => {
      expect(latestUpdatedAt(set)).toBe(2000);
    });

    it('un set vacío no inventa un updatedAt', () => {
      expect(latestUpdatedAt({})).toBeNull();
      expect(failedResourceNames({})).toEqual([]);
    });

    it('si un endpoint vuelve, deja de contar como fallido', () => {
      const recovered = { ...set, proxies: { status: 'ready' as const, data: 1, error: null, updatedAt: 3000, isStale: false } };
      expect(failedResourceNames(recovered)).toEqual(['queue']);
    });
  });
});
