import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clock3, Copy, Play, Plus, Search } from 'lucide-react';
import { useResource } from '../data/resource';
import { buildCurl, flattenOpenApi } from '../data/mappers';
import { ConfirmActionDialog } from './ConfirmActionDialog';

type ApiRunner = (method: string, endpoint: string, body?: unknown) => Promise<unknown>;

export function ApiReferenceWorkbench({ onRun, onCount }: { onRun: ApiRunner; onCount?: (count: number) => void }) {
  const spec = useResource('/api/openapi.json', (raw) => raw as never);
  const operations = useMemo(() => flattenOpenApi(spec.data as never), [spec.data]);
  useEffect(() => { if (spec.status === 'ready') onCount?.(operations.length); }, [operations.length, spec.status]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [tab, setTab] = useState<'docs' | 'playground' | 'logs'>('playground');
  const [requestTab, setRequestTab] = useState<'parametros' | 'headers' | 'autenticacion' | 'body'>('parametros');
  const [responseTab, setResponseTab] = useState<'json' | 'headers' | 'raw'>('json');
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const filtered = operations.filter((op) => `${op.summary} ${op.path} ${op.method}`.toLowerCase().includes(query.toLowerCase()));
  const active = operations.find((op) => op.key === selectedKey) ?? filtered[0];
  const concretePath = active?.path.replace(/\{([^}]+)\}/g, (_whole, name: string) => pathValues[name] ? encodeURIComponent(pathValues[name]) : `<${name}>`) ?? '';
  const curl = active ? buildCurl(active, window.location.origin, pathValues, body.trim() || null) : '';
  useEffect(() => { setPathValues({}); setBody(active?.sampleBody ?? ''); setResult(''); }, [active?.key, active?.sampleBody]);

  const execute = async (confirmed = false) => {
    if (!active || concretePath.includes('<')) return;
    if (active.methodKind !== 'read' && !confirmed) { setConfirming(true); return; }
    setConfirming(false);
    setRunning(true);
    try {
      const parsed = body.trim() ? JSON.parse(body) : undefined;
      const data = await onRun(active.method, concretePath, parsed);
      setResult(JSON.stringify(data, null, 2));
      setHistory((current) => [`${new Date().toLocaleTimeString('es-ES')}　${active.method} ${concretePath}`, ...current].slice(0, 20));
    } catch (cause) { setResult(JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) }, null, 2)); }
    finally { setRunning(false); }
  };
  return <>
    {confirming && active && <ConfirmActionDialog title={`Ejecutar ${active.method}`} detail={`${concretePath} usará tu sesión actual y puede modificar datos reales.`} confirmLabel="Ejecutar solicitud" dangerous={active.methodKind === 'destroy'} onCancel={() => setConfirming(false)} onConfirm={() => void execute(true)}/>}
    <div className="ref-tabs ref-large-tabs" role="tablist" aria-label="API">{(['docs','playground','logs'] as const).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item === 'docs' ? 'Docs' : item === 'playground' ? 'Playground' : 'Logs'}</button>)}</div>
    <div className="ref-api-workbench">
      <section className="ref-section ref-api-endpoints"><header className="ref-section-head"><h2>Endpoints</h2><span>{operations.length}</span></header><label className="ref-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar endpoints" placeholder="Buscar endpoints..."/></label><div className="ref-api-endpoint-list">{spec.status === 'loading' && <p className="ref-empty">Cargando contrato OpenAPI…</p>}{spec.status === 'error' && <p className="ref-empty">{spec.error}</p>}{filtered.map((op) => <button key={op.key} className={active?.key === op.key ? 'active' : ''} onClick={() => setSelectedKey(op.key)}><span className={`ref-method ref-method-${op.method.toLowerCase()}`}>{op.method}</span><span>{op.summary}<small>{op.path}</small></span></button>)}</div></section>
      <section className="ref-section ref-api-request"><header className="ref-section-head"><h2>{active?.summary || 'Selecciona un endpoint'}</h2><span>{active?.path || '—'}</span></header>{active && <><div className="ref-api-operation"><span className={`ref-method ref-method-${active.method.toLowerCase()}`}>{active.method}</span><code>{active.path}</code><p>{active.operationId}</p></div>{tab === 'playground' ? <><div className="ref-api-form-title">Solicitud</div><div className="ref-api-send-row"><span className={`ref-method ref-method-${active.method.toLowerCase()}`}>{active.method}</span><input aria-label="URL de la solicitud" readOnly value={`${window.location.origin}${concretePath}`}/><button className="ref-blue-button" onClick={() => void execute()} disabled={running || concretePath.includes('<')}><Play size={15}/>{running ? 'Enviando…' : 'Enviar solicitud'}</button></div><div className="ref-tabs" role="tablist" aria-label="Solicitud">{(['parametros','headers','autenticacion','body'] as const).map((item) => <button role="tab" aria-selected={requestTab === item} key={item} className={requestTab === item ? 'active' : ''} onClick={() => setRequestTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div><div className="ref-api-fields">{requestTab === 'parametros' && (active.pathParams.length ? active.pathParams.map((name) => <label key={name}>{name}<input value={pathValues[name] ?? ''} onChange={(event) => setPathValues((current) => ({...current,[name]:event.target.value}))} placeholder={`Valor de ${name}`}/></label>) : <p>No hay parámetros de ruta definidos.</p>)}{requestTab === 'headers' && <p>Content-Type: application/json</p>}{requestTab === 'autenticacion' && <p>{active.needsSession ? 'Usa la sesión actual del panel.' : 'Endpoint público.'} {active.roleRequired ? `Rol necesario: ${active.roleRequired}.` : ''}</p>}{requestTab === 'body' && (active.sampleBody !== null ? <textarea aria-label="Cuerpo JSON" value={body} onChange={(event) => setBody(event.target.value)} rows={7}/> : <p>Este endpoint no declara cuerpo JSON.</p>)}</div><div className="ref-api-curl"><header><h3>Comando cURL generado</h3><button onClick={async () => { await navigator.clipboard.writeText(curl); setCopied(true); }}><Copy size={14}/>{copied ? 'Copiado' : 'Copiar'}</button></header><pre>{curl}</pre></div></> : tab === 'docs' ? <div className="ref-api-fields"><h3>Documentación</h3><p>{active.summary}</p><p>Método: {active.method} · Ruta: {active.path}</p><p>{active.roleRequired ? `Rol requerido: ${active.roleRequired}` : 'Sin rol específico declarado'}</p></div> : <div className="ref-api-fields"><h3>Solicitudes de esta sesión</h3>{history.map((entry,index) => <p key={index}>{entry}</p>)}{history.length === 0 && <p>Aún no se han enviado solicitudes desde esta vista.</p>}</div>}</>}</section>
      <section className="ref-section ref-api-response"><header className="ref-section-head"><h2>Respuesta</h2>{result && <span className="ref-status ref-status-green"><Check size={13}/> Recibida</span>}</header><div className="ref-tabs" role="tablist" aria-label="Respuesta">{(['json','headers','raw'] as const).map((item) => <button role="tab" aria-selected={responseTab === item} key={item} className={responseTab === item ? 'active' : ''} onClick={() => setResponseTab(item)}>{item === 'json' ? 'JSON' : item === 'headers' ? 'Headers' : 'Vista raw'}</button>)}</div><pre className="ref-api-result">{result ? result : 'Envía una solicitud para ver la respuesta real.'}</pre><div className="ref-api-info"><h3><Clock3 size={16}/> Estado de la API</h3><p>Contrato generado desde <code>GET /api/openapi.json</code></p><p><ChevronDown size={14}/> {operations.length} operaciones disponibles</p><button className="ref-secondary" onClick={() => setTab('docs')}><Plus size={14}/> Ver documentación</button></div></section>
    </div>
  </>;
}
