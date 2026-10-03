// ---------------------------------------------------------------------------
// TASK §23 — Resource: estado de carga/stale/error/retry + cancelación de
// requests obsoletas, en un único lugar. Ninguna vista hace fetch suelto.
//
// Estados por recurso:
//   idle      → aún no se ha pedido
//   loading   → primer fetch, sin datos previos (muestra Skeleton)
//   ready     → datos frescos
//   stale     → hay datos pero el último refresh falló (se conservan y se marca)
//   error     → sin datos y el fetch falló (muestra ErrorState con retry)
//
// `partialFailures` se usa cuando un conjunto de recursos se refresca en bloque
// y solo algunos fallan: los datos válidos se muestran igual y el resto queda
// marcado, sin inventar valores.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
  /** ISO del último fetch que devolvió datos válidos. */
  updatedAt: number | null;
  /** true si `data` viene de una respuesta old y el refresh falló. */
  isStale: boolean;
}

const INITIAL: ResourceState<never> = {
  status: 'idle', data: null, error: null, updatedAt: null, isStale: false,
};

// --- Transiciones puras (testeables sin DOM) --------------------------------
// El hook de abajo es una capa fina sobre estas funciones: toda la lógica de
// decisión (stale vs error, qué se conserva) vive aquí y se testea en node.

/** Un fetch correcto SIEMPRE invalida cualquier error previo. */
export function reduceStart<T>(prev: ResourceState<T>): ResourceState<T> {
  return prev.data === null
    ? { status: 'loading', data: null, error: null, updatedAt: null, isStale: false }
    : { ...prev, status: 'ready', error: null, isStale: false };
}

export function reduceSuccess<T>(prev: ResourceState<T>, data: T, at: number = Date.now()): ResourceState<T> {
  return { status: 'ready', data, error: null, updatedAt: at, isStale: false };
}

/** Fallo con datos previos → stale (se conservan). Fallo sin datos → error. */
export function reduceFailure<T>(prev: ResourceState<T>, error: string): ResourceState<T> {
  return prev.data === null
    ? { status: 'error', data: null, error, updatedAt: null, isStale: false }
    : { ...prev, status: 'stale', error, isStale: true };
}

/** Extrae el mensaje REAL del backend; si no lo hay, el status HTTP. */
export function errorMessageFrom(status: number, body: unknown): string {
  const detail = body as { error?: unknown } | null;
  if (detail && typeof detail.error === 'string' && detail.error.trim() !== '') return detail.error;
  return `HTTP ${status}`;
}

/** Última fecha de actualización entre varios recursos. */
export function latestUpdatedAt<T>(resources: Record<string, ResourceState<T>>): number | null {
  const stamps = Object.values(resources).map((r) => r.updatedAt).filter((n): n is number => n !== null);
  return stamps.length ? Math.max(...stamps) : null;
}

/** Nombres de recursos no frescos (error o stale) → partial failure. */
export function failedResourceNames<T>(resources: Record<string, ResourceState<T>>): string[] {
  return Object.entries(resources)
    .filter(([, r]) => r.status === 'error' || r.status === 'stale')
    .map(([name]) => name);
}

export interface UseResourceOptions {
  /** enabled=false → no hace fetch (evita llamadas pre-login). */
  enabled?: boolean;
  /** Polling en ms. 0 o undefined = sin polling. */
  pollMs?: number;
}

export interface UseResourceResult<T> extends ResourceState<T> {
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Hook de recurso con cancelación de requests obsoletas: cada `reload` aborta
 * el AbortController anterior, así una respuesta lenta ya no puede pisaar una
 * más reciente (TASK §23: "cancelar requests obsoletas").
 */
export function useResource<T>(
  url: string | null,
  map: (raw: unknown) => T,
  options: UseResourceOptions = {},
): UseResourceResult<T> {
  const { enabled = true, pollMs = 0 } = options;
  const [state, setState] = useState<ResourceState<T>>(INITIAL as ResourceState<T>);
  const controllerRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    const seq = ++requestSeq.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => reduceStart(prev));

    try {
      const res = await apiFetch(url, { signal: controller.signal });
      if (seq !== requestSeq.current) return; // respuesta obsoleta: se ignora
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setState((prev) => reduceFailure(prev, errorMessageFrom(res.status, detail)));
        return;
      }
      const raw = await res.json();
      if (seq !== requestSeq.current) return;
      const mapped = mapRef.current(raw);
      setState((prev) => reduceSuccess(prev, mapped));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      if ((e as Error)?.name === 'AbortError') return;
      const message = e instanceof Error ? e.message : String(e);
      setState((prev) => reduceFailure(prev, message));
    }
  }, [url, enabled]);

  useEffect(() => {
    if (!enabled || !url) return;
    void load();
    if (!pollMs || pollMs <= 0) return;
    const timer = setInterval(() => { void load(); }, pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs, url, enabled]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reload = useCallback(() => { void load(); }, [load]);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (p: T | null) => T | null)(prev.data)
        : updater;
      return { ...prev, data: next, status: 'ready' };
    });
  }, []);

  return { ...state, reload, setData };
}

export interface PolledSetResult<T> {
  resources: Record<string, ResourceState<T>>;
  reloadAll: () => void;
  /** Endpoints que fallaron en el último refresh (partial failure). */
  failedEndpoints: string[];
  /** true si TODOS los endpoints del set fallaron. */
  allFailed: boolean;
  isLoading: boolean;
  updatedAt: number | null;
}

/**
 * Refresco conjunto de N endpoints. Un endpoint lento o caído NO bloquea al
 * resto (Promise.allSettled) y los datos previos se conservan como `stale`.
 */
export function usePolledSet<T>(
  entries: Record<string, string | null>,
  map: (raw: unknown) => T,
  pollMs = 0,
  enabled = true,
): PolledSetResult<T> {
  const [resources, setResources] = useState<Record<string, ResourceState<T>>>({});
  const seq = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const signature = JSON.stringify(entries);

  const reloadAll = useCallback(async () => {
    if (!enabled) return;
    const list = Object.entries(entries).filter(([, url]) => !!url) as [string, string][];
    if (list.length === 0) return;
    const mySeq = ++seq.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const settled = await Promise.allSettled(
      list.map(async ([, url]) => {
        const res = await apiFetch(url, { signal: controller.signal });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(typeof detail?.error === 'string' ? detail.error : `HTTP ${res.status}`);
        }
        return [url, await res.json()] as const;
      }),
    );
    if (mySeq !== seq.current) return;

    const byUrl = new Map<string, unknown>(
      settled
        .filter((s): s is PromiseFulfilledResult<readonly [string, unknown]> => s.status === 'fulfilled')
        .map((s) => [s.value[0], s.value[1]]),
    );
    const urlByIndex = list.map((entry) => entry[1]);
    setResources((prev) => {
      const next: Record<string, ResourceState<T>> = { ...prev };
      for (const [name, url] of list) {
        const okEntry = byUrl.get(url);
        if (okEntry !== undefined) {
          next[name] = reduceSuccess(next[name] ?? (INITIAL as ResourceState<T>), mapRef.current(okEntry));
        } else {
          const index = urlByIndex.indexOf(url);
          const failure = settled[index] as PromiseRejectedResult | undefined;
          const message = failure?.reason instanceof Error ? failure.reason.message : 'Error de red';
          const prevState = next[name] ?? (INITIAL as ResourceState<T>);
          next[name] = reduceFailure(prevState, message);
        }
      }
      return next;
    });
  }, [signature, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reloadAll();
    if (!pollMs || pollMs <= 0) return;
    const timer = setInterval(() => { void reloadAll(); }, pollMs);
    return () => clearInterval(timer);
  }, [reloadAll, pollMs, enabled]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const names = Object.keys(resources);
  const failedEndpoints = failedResourceNames(resources);

  return {
    resources,
    reloadAll,
    failedEndpoints,
    allFailed: names.length > 0 && failedEndpoints.length === names.length,
    isLoading: names.length === 0 || names.some((n) => resources[n].status === 'loading'),
    updatedAt: latestUpdatedAt(resources),
  };
}
