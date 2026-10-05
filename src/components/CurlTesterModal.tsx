import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { apiFetch } from '../api';
import { useResource } from '../data/resource';
import { buildCurl, flattenOpenApi, type ApiOperationViewModel } from '../data/mappers';
import { FilterBar } from './design/FilterBar';
import { EmptyState } from './design/EmptyState';
import { ErrorState } from './design/ErrorState';
import { Skeleton } from './design/Skeleton';
import { StatusBadge, type StatusBadgeKind } from './design/StatusBadge';
import { ConfirmActionDialog } from './ConfirmActionDialog';

interface CurlTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunEndpointTest: (method: string, endpoint: string, body?: any) => Promise<any>;
}

const METHOD_KIND: Record<ApiOperationViewModel['methodKind'], StatusBadgeKind> = {
  read: 'info',
  write: 'brand',
  destroy: 'danger',
};

const METHOD_LABEL: Record<ApiOperationViewModel['methodKind'], string> = {
  read: 'Lectura',
  write: 'Escritura',
  destroy: 'Destructivo',
};

type ExecutionState = { status: number; body: string } | null;

/**
 * Explorador cURL REAL (TASK §16).
 *
 * La lista de endpoints NO está escrita a mano: se carga de
 * GET /api/openapi.json, que el servidor genera recorriendo su propio router
 * Express y los esquemas Zod reales. Si el backend añade o quita una ruta, este
 * modal lo refleja sin tocar una línea de React.
 */
export const CurlTesterModal: React.FC<CurlTesterModalProps> = ({
  isOpen,
  onClose,
  onRunEndpointTest,
}) => {
  const [query, setQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | ApiOperationViewModel['methodKind']>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>('');
  const [result, setResult] = useState<ExecutionState>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  const spec = useResource(
    isOpen ? '/api/openapi.json' : null,
    (raw) => raw as never,
    { enabled: isOpen },
  );

  const operations = useMemo(() => flattenOpenApi(spec.data as never), [spec.data]);

  const tags = useMemo(
    () => Array.from(new Set(operations.flatMap((o) => o.tags))).sort(),
    [operations],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operations.filter((op) => {
      if (methodFilter !== 'all' && op.methodKind !== methodFilter) return false;
      if (tagFilter !== 'all' && !op.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        op.path.toLowerCase().includes(q) ||
        op.summary.toLowerCase().includes(q) ||
        op.operationId.toLowerCase().includes(q)
      );
    });
  }, [operations, query, methodFilter, tagFilter]);

  const active: ApiOperationViewModel | null =
    operations.find((o) => o.key === activeKey) ?? filtered[0] ?? null;

  useEffect(() => {
    setPathValues({});
    setBodyText(active?.sampleBody ?? '');
    setResult(null);
  }, [active?.key]);

  if (!isOpen) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const curl = active ? buildCurl(active, baseUrl, pathValues, bodyText.trim() || null) : '';

  const concretePath = active
    ? active.path.replace(/\{([^}]+)\}/g, (_m, name: string) => pathValues[name] ?? `<${name}>`)
    : '';

  const handleRun = async (confirmed = false) => {
    if (!active) return;
    if (active.methodKind !== 'read' && !confirmed) { setConfirming(true); return; }
    setConfirming(false);
    setLoading(true);
    setResult(null);
    try {
      const payload = bodyText.trim() ? JSON.parse(bodyText) : undefined;
      if (bodyText.trim() && payload === undefined) throw new Error('El body no es JSON válido');
      const data = await onRunEndpointTest(active.method, concretePath, payload);
      setResult({ status: 200, body: JSON.stringify(data, null, 2) });
    } catch (e) {
      setResult({ status: 0, body: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const listBody = () => {
    if (spec.status === 'loading') {
      return (
        <div className="space-y-2 p-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      );
    }
    if (spec.status === 'error') {
      return (
        <ErrorState
          title="No se pudo cargar el contrato de la API"
          message={spec.error ?? undefined}
          onRetry={spec.reload}
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          title={operations.length === 0 ? 'El servidor no expone ninguna ruta' : 'Ningún endpoint coincide'}
          description={
            operations.length === 0
              ? 'GET /api/openapi.json devolvió un documento sin rutas.'
              : 'Ajusta la búsqueda o el filtro de método.'
          }
        />
      );
    }
    return (
      <ul className="space-y-1 text-xs">
        {filtered.map((op) => (
          <li key={op.key}>
            <button
              onClick={() => setActiveKey(op.key)}
              aria-current={active?.key === op.key}
              className={`w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-colors font-mono ${
                active?.key === op.key
                  ? 'bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/40 text-[var(--color-brand)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                  op.methodKind === 'read'
                    ? 'text-[var(--color-info)] border-[var(--color-info)]/30 bg-[var(--color-info)]/10'
                    : op.methodKind === 'destroy'
                      ? 'text-[var(--color-danger)] border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10'
                      : 'text-[var(--color-brand)] border-[var(--color-brand)]/30 bg-[var(--color-brand)]/10'
                }`}>
                  {op.method}
                </span>
                <span className="truncate font-semibold text-[var(--color-text)]">{op.summary}</span>
              </span>
              <span className="text-[10px] text-[var(--color-muted-2)] truncate">{op.path}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      {confirming && active && <ConfirmActionDialog title={`Ejecutar ${active.method}`} detail={`${concretePath} usará tu sesión actual. Clasificación: ${METHOD_LABEL[active.methodKind]}. La acción puede no ser reversible.`} confirmLabel="Ejecutar solicitud" dangerous={active.methodKind === 'destroy'} onCancel={() => setConfirming(false)} onConfirm={() => void handleRun(true)}/>}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-label="Explorador de la API del panel"
        className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="bg-[var(--color-surface-2)] px-4 py-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wider truncate">
              API Explorer
            </h3>
            <p className="text-[11px] text-[var(--color-muted-2)] font-sans normal-case">
              {spec.status === 'ready'
                ? `${operations.length} operaciones desde GET /api/openapi.json · contrato v${(spec.data as never as { info: { version: string } }).info.version}`
                : 'Cargando contrato generado por el servidor…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {spec.isStale && <StatusBadge kind="warn" label="Stale" title={spec.error ?? undefined} />}
            <button onClick={spec.reload} className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-line)] rounded-lg px-2 py-1">
              Recargar
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="text-[var(--color-muted)] hover:text-[var(--color-text)] font-bold text-sm p-1">✕</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <aside className="w-80 shrink-0 bg-[var(--color-canvas)] border-r border-[var(--color-line)] flex flex-col min-h-0">
            <div className="p-2 border-b border-[var(--color-line)] space-y-2">
              <FilterBar
                query={query}
                onQueryChange={setQuery}
                options={[
                  { value: 'all', label: 'Todos', count: operations.length },
                  { value: 'read', label: 'Lectura', count: operations.filter((o) => o.methodKind === 'read').length },
                  { value: 'write', label: 'Escritura', count: operations.filter((o) => o.methodKind === 'write').length },
                  { value: 'destroy', label: 'Destr.', count: operations.filter((o) => o.methodKind === 'destroy').length },
                ]}
                activeOption={methodFilter}
                onActiveOptionChange={(v) => setMethodFilter(v as typeof methodFilter)}
                placeholder="Buscar ruta, resumen u operationId…"
                searchLabel="Buscar endpoint"
                filtersLabel="Filtrar por clase de método"
              />
              {tags.length > 1 && (
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  aria-label="Filtrar por tag"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)]"
                >
                  <option value="all">Todos los tags</option>
                  {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">{listBody()}</div>
          </aside>

          <section className="flex-1 flex flex-col p-4 bg-[var(--color-canvas)] overflow-y-auto space-y-4 min-w-0">
            {!active ? (
              <EmptyState title="Selecciona un endpoint" description="La lista se genera desde el router real del servidor." />
            ) : (
              <>
                <header className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge kind={METHOD_KIND[active.methodKind]} label={active.method} />
                    <h4 className="text-sm font-bold text-[var(--color-text)] font-sans">{active.summary}</h4>
                  </div>
                  <code className="block text-xs text-[var(--color-muted)] break-all">
                    {baseUrl}{active.path}
                  </code>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge kind="neutral" label={active.operationId} quiet />
                    {active.roleRequired && <StatusBadge kind="warn" label={`Rol ${active.roleRequired}`} />}
                    {active.needsSession && <StatusBadge kind="info" label="Sesión" quiet />}
                    {active.needsCsrf && <StatusBadge kind="info" label="CSRF" quiet />}
                    {active.rateLimited && <StatusBadge kind="warn" label="Rate limited" quiet />}
                    {active.validated && <StatusBadge kind="ok" label="Zod validado" quiet />}
                    {active.tags.map((t) => <StatusBadge key={t} kind="neutral" label={t} quiet />)}
                  </div>
                </header>

                {active.pathParams.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {active.pathParams.map((name) => (
                      <label key={name} className="flex flex-col gap-1 text-[11px] text-[var(--color-muted-2)] font-sans">
                        <span>{name} (path param)</span>
                        <input
                          value={pathValues[name] ?? ''}
                          onChange={(e) => setPathValues((prev) => ({ ...prev, [name]: e.target.value }))}
                          placeholder={`<${name}>`}
                          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)]"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {active.sampleBody !== null ? (
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--color-muted-2)] font-sans">
                    <span>
                      Body — generado desde el JSON Schema real del endpoint
                      {active.validated ? ' (misma validación Zod que en runtime)' : ''}
                    </span>
                    <textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      rows={Math.min(12, Math.max(3, bodyText.split('\n').length))}
                      spellCheck={false}
                      className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-2 text-xs text-[var(--color-text)] font-mono"
                    />
                  </label>
                ) : (
                  <p className="text-[11px] text-[var(--color-muted-2)] font-sans">
                    Este endpoint no declara cuerpo: el backend no aplica validación Zod al body.
                  </p>
                )}

                <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-3 relative text-xs text-[var(--color-brand)]">
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 bg-[var(--color-canvas)] hover:bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-line)] px-2.5 py-1 rounded-lg text-[11px] font-bold"
                  >
                    {copied ? 'Copiado' : 'Copiar cURL'}
                  </button>
                  <pre className="pr-24 whitespace-pre-wrap break-all">{curl}</pre>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleRun()}
                    disabled={loading}
                    className="bg-[var(--color-brand)] hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? 'Ejecutando…' : 'Ejecutar'}
                  </button>
                  {active.methodKind !== 'read' && (
                    <span className="text-[11px] text-[var(--color-warn)] font-sans">
                      Pide confirmación: usa tu sesión y rol reales.
                    </span>
                  )}
                </div>

                {result && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--color-muted-2)] font-sans">
                      Respuesta {result.status === 0 ? '(sin respuesta)' : ''}
                    </span>
                    <pre className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-3 text-xs text-[var(--color-muted)] overflow-auto max-h-60 whitespace-pre-wrap break-all">
                      {result.body}
                    </pre>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};
