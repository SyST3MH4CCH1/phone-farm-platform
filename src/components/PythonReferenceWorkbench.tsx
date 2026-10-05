import React, { useEffect, useState } from 'react';
import { ChevronDown, Code2, Copy, FileCode2, Folder, Play, RefreshCw, Save, Search, Smartphone } from 'lucide-react';
import { apiFetch } from '../api';
import type { LogEntry } from '../types';

export function PythonReferenceWorkbench({ onOpenEditor, logs }: { onOpenEditor: () => void; logs: LogEntry[] }) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ejecucion' | 'parametros' | 'entorno' | 'cola'>('ejecucion');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/source').then(async (response) => {
      if (!response.ok) throw new Error(response.status === 403 || response.status === 404 ? 'Código fuente no disponible en esta instalación (EXPOSE_SOURCE=false).' : `No se pudo listar el código (HTTP ${response.status}).`);
      const data = await response.json();
      const names = Array.isArray(data) ? data : Array.isArray(data.files) ? data.files : [];
      if (!cancelled) { setFiles(names); setSelected(names[0] || ''); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/source/${encodeURIComponent(selected)}`).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo abrir ${selected} (HTTP ${response.status}).`);
      const data = await response.json();
      if (!cancelled) { setContent(typeof data === 'string' ? data : String(data.content ?? data.code ?? '')); setError(''); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  return <><div className="ref-python-workbench">
    <section className="ref-section ref-python-files"><header className="ref-section-head"><h2>Archivos</h2><button className="ref-icon-button" onClick={onOpenEditor} aria-label="Abrir visor de código"><RefreshCw size={16}/></button></header><label className="ref-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar archivos" placeholder="Buscar archivos..."/></label><div className="ref-python-file-list"><div className="ref-python-folder"><ChevronDown size={13}/><Folder size={15}/> platform/phonefarm</div>{files.filter((file) => file.toLowerCase().includes(query.toLowerCase())).map((file) => <button key={file} className={selected === file ? 'active' : ''} onClick={() => setSelected(file)}><FileCode2 size={15}/>{file}</button>)}{!loading && files.length === 0 && <p className="ref-empty">{error || 'No hay archivos visibles.'}</p>}</div></section>
    <section className="ref-section ref-python-editor"><header className="ref-section-head"><div className="ref-python-tab"><FileCode2 size={16}/>{selected || 'Sin archivo seleccionado'}</div><div><button className="ref-secondary" onClick={() => content && navigator.clipboard.writeText(content)} disabled={!content}><Copy size={14}/> Copiar</button><button className="ref-secondary" onClick={onOpenEditor}><Save size={14}/> Abrir visor</button></div></header>{error && <p className="ref-python-error" role="alert">{error}</p>}<pre className="ref-python-code"><code>{loading ? 'Cargando código…' : content || 'Selecciona un archivo del explorador.'}</code></pre><footer className="ref-python-status">{selected || '—'}　 · Python　 · UTF-8　 · Solo lectura</footer></section>
    <section className="ref-section ref-python-run"><nav className="ref-account-tabs">{(['ejecucion','parametros','entorno','cola'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'ejecucion' ? 'Ejecución' : item === 'cola' ? 'Job / Cola' : item[0].toUpperCase()+item.slice(1)}</button>)}</nav><div className="ref-python-run-content">{tab === 'ejecucion' ? <><label>Script<div className="ref-field"><FileCode2 size={17}/>{selected || 'Selecciona un archivo'}</div></label><label>Dispositivo<div className="ref-field"><Smartphone size={17}/> Selecciona un dispositivo en el visor</div></label><label>Parámetros (JSON)<pre className="ref-python-code ref-python-json">{'{}'}</pre></label><button className="ref-blue-button" onClick={onOpenEditor}><Play size={15}/> Abrir código fuente</button><p className="ref-muted">Esta instalación no ofrece ejecución directa de scripts desde esta pantalla.</p></> : <p className="ref-muted">{tab === 'parametros' ? 'Los parámetros de ejecución no están expuestos por el backend.' : tab === 'entorno' ? 'Las variables de entorno se gestionan fuera de esta vista.' : 'No hay historial de ejecución de scripts disponible.'}</p>}</div></section>
  </div><div className="ref-python-lower">
    <section className="ref-section"><header className="ref-section-head"><h2>Consola</h2><span className="ref-muted">Eventos del servidor</span></header><div className="ref-python-logs">{logs.length ? logs.slice(-8).map((entry) => <div key={entry.id}><time>{entry.timestamp}</time><strong className={`ref-log-${entry.level.toLowerCase()}`}>[{entry.level}]</strong><span>[{entry.module}] {entry.message}</span></div>) : <p className="ref-empty">No hay eventos recientes.</p>}</div></section>
    <section className="ref-section"><header className="ref-section-head"><h2>Historial de ejecuciones</h2></header><p className="ref-empty">El servidor no expone un historial de scripts ejecutados.</p></section>
  </div></>;
}
