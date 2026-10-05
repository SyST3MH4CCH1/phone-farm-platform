import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CalendarDays, Check, CheckCircle2, Clock3,
  Code2, FileCode2, GitBranch, Globe2, Layers3, Link2, List,
  Play, Plus, RefreshCw, Search, Send, Server, ShieldCheck,
  Smartphone, Sparkles, Users, Zap,
} from 'lucide-react';
import type { Account, LogEntry, ProxyItem, QueueJob, StackInfo, SystemStats } from '../types';
import { AccountReferenceDetail } from './AccountReferenceDetail';
import { PythonReferenceWorkbench } from './PythonReferenceWorkbench';
import { ApiReferenceWorkbench } from './ApiReferenceWorkbench';
import { MoneyPrinterReferenceWorkbench } from './MoneyPrinterReferenceWorkbench';
import { PandaReferenceGrid } from './PandaReferenceGrid';
import { ProxyReferenceWorkbench } from './ProxyReferenceWorkbench';
import { QueueReferenceDetail } from './QueueReferenceDetail';
import { VersionsReferenceWorkbench } from './VersionsReferenceWorkbench';
import { AdbReferenceWorkbench, type AdbReferenceDevice } from './AdbReferenceWorkbench';

export type ReferenceView = 'cuentas' | 'cola' | 'proxies' | 'moneyprinter' | 'adb' | 'panda' | 'curl' | 'code' | 'versions';
type WarmupStatus = { dry_run: boolean; emergency_stop: boolean; real_enabled: boolean; accounts: { account_id: string; state: string; phase_day: number | null; remaining_today: number | null; paused_until: number | null; checklist: string[] }[] };

type Props = {
  view: ReferenceView;
  accounts: Account[];
  queue: QueueJob[];
  proxies: ProxyItem[];
  stats: SystemStats;
  stack: StackInfo;
  deviceCount: number;
  devices: AdbReferenceDevice[];
  logs: LogEntry[];
  onSelectAccount: (account: Account) => void;
  onAddAccount: (account: Partial<Account>) => Promise<string | null>;
  onProcessNextJob: () => void;
  onOpenTool: (view: ReferenceView) => void;
  onOpenPreview: (job: QueueJob) => void;
  onOpenCalendar: () => void;
  onRunApi: (method: string, endpoint: string, body?: unknown) => Promise<unknown>;
  onRefresh: () => void;
};

const labels: Record<ReferenceView, { title: string; description: string; action: string }> = {
  cuentas: { title: 'Cuentas', description: 'Gestiona tus cuentas de redes sociales, monitorea su estado y rendimiento.', action: 'Nueva cuenta' },
  cola: { title: 'Cola', description: 'Gestiona la cola de generación y publicación de contenido', action: 'Generar siguiente' },
  proxies: { title: 'Proxies', description: 'Gestión de proxies, rotación y monitoreo de salud', action: 'Añadir proxy' },
  moneyprinter: { title: 'MoneyPrinter', description: 'Genera, edita y publica contenido para todas tus cuentas', action: 'Crear contenido' },
  adb: { title: 'ADB Bridge', description: 'Conecta, monitoriza y controla tus dispositivos Android', action: 'Conectar dispositivo' },
  panda: { title: 'Panda Live', description: 'Monitoreo en tiempo real de dispositivos y sesiones', action: 'Abrir dispositivos' },
  curl: { title: 'cURL API', description: 'Explora y prueba la API de Phone Farm con solicitudes cURL', action: 'Abrir playground' },
  code: { title: 'Código Python', description: 'Desarrolla y ejecuta scripts para automatizar tareas en tu Phone Farm', action: 'Abrir editor' },
  versions: { title: 'Versiones', description: 'Control de versiones, despliegues y gestión de entornos', action: 'Ver versiones' },
};

const formatNumber = (n: number) => new Intl.NumberFormat('es-ES').format(n);
const accountAge = (createdAt: string) => {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '—';
  const months = Math.max(0, (new Date().getFullYear() - created.getFullYear()) * 12 + new Date().getMonth() - created.getMonth());
  return months >= 12 ? `${Math.floor(months / 12)} años, ${months % 12} meses` : `${months} meses`;
};
const readyStates = new Set<QueueJob['status']>(['awaiting_preview', 'ready_for_publish']);
const workingStates = new Set<QueueJob['status']>(['scripting', 'generating', 'awaiting_approval']);
const waitingStates = new Set<QueueJob['status']>(['pending']);
const badStates = new Set<QueueJob['status']>(['failed', 'rejected', 'awaiting_manual_upload']);

function Metric({ label, value, detail, tone, icon }: { label: string; value: string | number; detail?: string; tone: 'blue' | 'green' | 'purple' | 'yellow' | 'red'; icon: React.ReactNode }) {
  return <div className={`ref-metric ref-tone-${tone}`}>
    <span className="ref-metric-icon">{icon}</span>
    <div className="ref-metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail ?? 'Datos actuales'}</small></div>
    <div className="ref-metric-decoration" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
  </div>;
}

function Section({ title, children, action, className = '' }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <section className={`ref-section ${className}`}><header className="ref-section-head"><h2>{title}</h2>{action}</header>{children}</section>;
}

function Status({ children, tone }: { children: React.ReactNode; tone: 'green' | 'blue' | 'yellow' | 'red' | 'purple' }) {
  return <span className={`ref-status ref-status-${tone}`}>{children}</span>;
}

export function ReferenceViews({ view, accounts, queue, proxies, stats, stack, deviceCount, devices, logs, onSelectAccount, onAddAccount, onProcessNextJob, onOpenTool, onOpenPreview, onOpenCalendar, onRunApi, onRefresh }: Props) {
  const [query, setQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedProxy, setSelectedProxy] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState('all');
  const [jobAccountFilter, setJobAccountFilter] = useState('all');
  const [jobDeviceFilter, setJobDeviceFilter] = useState('all');
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [nicheFilter, setNicheFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [proxyFilter, setProxyFilter] = useState('all');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountFormError, setAccountFormError] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [apiEndpointCount, setApiEndpointCount] = useState<number | null>(null);
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus | null>(null);
  const [warmupError, setWarmupError] = useState('');
  useEffect(() => {
    if (view !== 'cuentas') return;
    const controller = new AbortController();
    setWarmupError('');
    fetch('/api/warmup/status', { credentials: 'include', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<WarmupStatus>; })
      .then(setWarmupStatus)
      .catch(error => { if (!controller.signal.aborted) setWarmupError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [view, accounts.length]);
  const [newAccount, setNewAccount] = useState({ username: '', device_serial: '', proxy_id: '' });
  useEffect(() => {
    if (!showAccountForm) return;
    const previous = document.activeElement;
    const dialog = document.querySelector<HTMLElement>('.ref-dialog');
    const controls = [...(dialog?.querySelectorAll<HTMLElement>('button,input,select') ?? [])];
    controls[1]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAccountForm(false);
      if (event.key !== 'Tab' || controls.length === 0) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [showAccountForm]);
  const heading = labels[view];
  const selectedQueueJob = queue.find(j => j.id === selectedJob) ?? queue[0];
  const selectedAccountItem = accounts.find(a => a.id === selectedAccount) ?? accounts[0];
  const selectedProxyItem = proxies.find(p => p.id === selectedProxy) ?? proxies[0];
  const filteredAccounts = useMemo(() => accounts.filter(a =>
    (accountFilter === 'all' || a.status === accountFilter) &&
    (platformFilter === 'all' || a.platform === platformFilter) &&
    (nicheFilter === 'all' || a.niche === nicheFilter) &&
    (deviceFilter === 'all' || a.device_serial === deviceFilter) &&
    (proxyFilter === 'all' || a.proxy_id === proxyFilter) &&
    `${a.username} ${a.niche ?? ''} ${a.device_serial}`.toLowerCase().includes(query.toLowerCase())
  ), [accounts, accountFilter, platformFilter, nicheFilter, deviceFilter, proxyFilter, query]);
  const filteredJobs = useMemo(() => queue.filter(j =>
    (jobAccountFilter === 'all' || j.target_account === jobAccountFilter) &&
    (jobStatusFilter === 'all' || j.status === jobStatusFilter) &&
    (jobDeviceFilter === 'all' || accounts.find(a => a.id === j.target_account || a.username === j.target_account)?.device_serial === jobDeviceFilter) &&
    `${j.id} ${j.keyword} ${j.target_account}`.toLowerCase().includes(query.toLowerCase())
  ), [queue, accounts, jobAccountFilter, jobStatusFilter, jobDeviceFilter, query]);
  const filteredProxies = useMemo(() => proxies.filter(p => `${p.id} ${p.provider} ${p.host}`.toLowerCase().includes(query.toLowerCase())), [proxies, query]);
  const count = (states: Set<QueueJob['status']>) => queue.filter(j => states.has(j.status)).length;
  const activeAccounts = accounts.filter(a => a.status === 'active').length;
  const onlineProxies = proxies.filter(p => p.status === 'online').length;
  const postsToday = (account: Account) => queue.filter(job =>
    (job.target_account === account.id || job.target_account === account.username) &&
    job.status === 'published' &&
    !!job.published_at && new Date(job.published_at).toDateString() === new Date().toDateString()
  ).length;
  const action = () => view === 'cuentas' ? setShowAccountForm(true) : view === 'cola' ? onProcessNextJob() : onOpenTool(view);

  return <div className={`ref-page ref-view-${view}`}>
    {showAccountForm && <div className="ref-dialog-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && !creatingAccount && setShowAccountForm(false)}><form className="ref-dialog" role="dialog" aria-modal="true" aria-label="Nueva cuenta" onSubmit={async e => { e.preventDefault(); setCreatingAccount(true); setAccountFormError(''); try { const error = await onAddAccount(newAccount); if (error) { setAccountFormError(error); return; } setShowAccountForm(false); setNewAccount({ username: '', device_serial: '', proxy_id: '' }); } catch (error) { setAccountFormError(error instanceof Error ? error.message : String(error)); } finally { setCreatingAccount(false); } }}><header><div><span className="ref-dialog-kicker">CUENTAS / REGISTRO</span><h2>Nueva cuenta</h2><p>Registra la ficha local de una cuenta que ya controlas. Configura su preparación en la pestaña Rampa; esta acción no crea ni conecta la cuenta social.</p></div><button type="button" onClick={() => setShowAccountForm(false)} aria-label="Cerrar" disabled={creatingAccount}>×</button></header><div className="ref-dialog-grid"><label>Usuario<input required value={newAccount.username} onChange={e => setNewAccount({...newAccount,username:e.target.value})}/></label><label>Serial del dispositivo<input required value={newAccount.device_serial} onChange={e => setNewAccount({...newAccount,device_serial:e.target.value})}/></label><label>Red asignada<select value={newAccount.proxy_id} onChange={e => setNewAccount({...newAccount,proxy_id:e.target.value})}><option value="">Sin asignar</option>{proxies.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}</select></label></div><p className="ref-dialog-note">Asignar una red no verifica la ubicación de la cuenta ni su autorización en la plataforma.</p>{accountFormError && <p role="alert" className="ref-form-error">{accountFormError}</p>}<footer><button type="button" className="ref-dialog-secondary" onClick={() => setShowAccountForm(false)} disabled={creatingAccount}>Cancelar</button><button className="ref-primary" type="submit" disabled={creatingAccount}>{creatingAccount ? 'Creando...' : 'Crear cuenta'}</button></footer></form></div>}
    {view !== 'cuentas' && <div className="ref-page-heading"><div><h1>{heading.title}</h1><p>{heading.description}</p></div><button className="ref-primary" onClick={action}><Plus size={16}/>{heading.action}</button></div>}

    {view === 'cuentas' && <>
      <div className="ref-accounts-layout"><div className="ref-accounts-main">
      <div className="ref-page-heading"><div><h1>{heading.title}</h1><p>{heading.description}</p></div><button className="ref-primary" onClick={action}><Plus size={16}/>{heading.action}</button></div>
      <div className="ref-metrics"><Metric label="Total de cuentas" value={formatNumber(accounts.length)} detail="Cuentas registradas" tone="blue" icon={<Users/>}/><Metric label="Cuentas activas" value={activeAccounts} detail={`${accounts.length ? Math.round(activeAccounts/accounts.length*100) : 0}% del total`} tone="green" icon={<CheckCircle2/>}/><Metric label="En riesgo" value={accounts.filter(a => a.status === 'warmup' || a.status === 'error').length} detail="Requieren atención" tone="yellow" icon={<AlertTriangle/>}/><Metric label="Suspendidas" value={accounts.filter(a => a.status === 'paused').length} detail="Cuentas pausadas" tone="red" icon={<Activity/>}/></div>
      <section className="ref-section ref-warmup-status" aria-label="Rampa de publicación oficial"><strong>Rampa de publicación oficial</strong>{warmupError ? <span role="alert">Estado no disponible: {warmupError}</span> : !warmupStatus ? <span>Cargando estado…</span> : <><span>{warmupStatus.dry_run ? 'Simulación' : 'Modo real solicitado'} · {warmupStatus.emergency_stop ? 'Interruptor de emergencia activo' : 'Interruptor desactivado'} · publicación real {warmupStatus.real_enabled ? 'habilitada' : 'bloqueada'}</span><span>{warmupStatus.accounts.length ? warmupStatus.accounts.map(item => `${accounts.find(a => a.id === item.account_id)?.username || item.account_id}: ${item.state} · restantes ${item.remaining_today ?? 'sin confirmar'}`).join(' · ') : 'Sin cuentas conectadas por OAuth. Completa perfil y revisa contenido manualmente.'}</span></>}</section>
      <section className="ref-section ref-account-filter-panel" aria-label="Filtros de cuentas">
        <div className="ref-account-filters">
          <label>Plataforma<select aria-label="Filtrar cuentas por plataforma" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}><option value="all">Todas</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="both">Ambas</option></select></label>
          <label>Nicho<select aria-label="Filtrar cuentas por nicho" value={nicheFilter} onChange={e => setNicheFilter(e.target.value)}><option value="all">Todos</option>{[...new Set(accounts.map(a => a.niche).filter(Boolean))].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Dispositivo<select aria-label="Filtrar cuentas por dispositivo" value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}><option value="all">Todos</option>{[...new Set(accounts.map(a => a.device_serial).filter(Boolean))].map(d => <option key={d} value={d}>{d}</option>)}</select></label>
          <label>Proxy<select aria-label="Filtrar cuentas por proxy" value={proxyFilter} onChange={e => setProxyFilter(e.target.value)}><option value="all">Todos</option>{[...new Set(accounts.map(a => a.proxy_id).filter(Boolean))].map(id => <option key={id} value={id}>{id}</option>)}</select></label>
          <label>Estado<select aria-label="Filtrar cuentas por estado" value={accountFilter} onChange={e => setAccountFilter(e.target.value)}><option value="all">Todos</option><option value="active">Activas</option><option value="warmup">En riesgo</option><option value="paused">Pausadas</option><option value="error">Con errores</option></select></label>
          <label className="ref-search ref-account-search"><Search size={15}/><input aria-label="Buscar cuentas" placeholder="Buscar cuentas, usuario o nicho..." value={query} onChange={e => setQuery(e.target.value)}/></label>
        </div>
      </section>
      <section className="ref-section ref-table-section" aria-label={`Lista de cuentas, ${filteredAccounts.length} resultados`}>
        <div className="ref-table-scroll"><table className="ref-table"><thead><tr><th>Plataforma</th><th>Usuario</th><th>Nicho</th><th>Antigüedad</th><th>Dispositivo</th><th>Proxy</th><th>Salud</th><th>Posts hoy</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredAccounts.map(a => <tr key={a.id} className={selectedAccountItem?.id === a.id ? 'ref-selected' : ''} onClick={() => setSelectedAccount(a.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelectedAccount(a.id)}><td><span className="ref-platform">{a.platform === 'tiktok' ? '♪' : a.platform === 'both' ? '◎' : '◎'}</span></td><td><strong>@{a.username}</strong><small>{a.device_serial}</small></td><td>{a.niche || '—'}</td><td><span>{accountAge(a.created_at)}</span><small>{a.created_at ? new Date(a.created_at).toLocaleDateString('es-ES') : '—'}</small></td><td><span className="ref-dot"/>{a.device_serial || '—'}</td><td>{a.proxy_id || '—'}</td><td><span className="ref-health"><span>{a.status === 'active' ? '●' : '◐'}</span>{a.status === 'active' ? 'Activa' : a.status === 'warmup' ? 'En riesgo' : 'Sin dato'}</span></td><td>{postsToday(a)}</td><td><Status tone={a.status === 'active' ? 'green' : a.status === 'paused' || a.status === 'error' ? 'red' : 'yellow'}>{a.status === 'active' ? 'Activa' : a.status === 'paused' ? 'Pausada' : a.status === 'warmup' ? 'En riesgo' : 'Error'}</Status></td><td><button className="ref-link" onClick={e => {e.stopPropagation(); onSelectAccount(a);}}>Ver</button></td></tr>)}</tbody></table>{filteredAccounts.length === 0 && <p className="ref-empty">No hay cuentas que coincidan con el filtro.</p>}</div>
      </section></div><AccountReferenceDetail account={selectedAccountItem} queue={queue} onOpenAccount={onSelectAccount} onOpenJob={onOpenPreview}/></div>
    </>}

    {view === 'cola' && <>
      <div className="ref-metrics ref-five"><Metric label="En cola" value={count(waitingStates)} detail="Pendientes" tone="blue" icon={<List/>}/><Metric label="Generando" value={count(workingStates)} detail="En proceso" tone="purple" icon={<Sparkles/>}/><Metric label="Listo" value={count(readyStates)} detail="Para revisar" tone="green" icon={<CheckCircle2/>}/><Metric label="Publicando" value={queue.filter(j => j.status === 'publishing').length} detail="En curso" tone="blue" icon={<Send/>}/><Metric label="Errores" value={count(badStates)} detail="Requieren atención" tone="red" icon={<AlertTriangle/>}/></div>
      <Section title={`Pipeline de la cola (${queue.length} jobs)`} className="ref-queue-pipeline"><div className="ref-pipeline">{[['En cola',count(waitingStates),'blue'],['Generando',count(workingStates),'purple'],['Listo',count(readyStates),'green'],['Publicando',queue.filter(j => j.status === 'publishing').length,'blue'],['Completado',queue.filter(j => j.status === 'published').length,'green'],['Errores',count(badStates),'red']].map(([name,num,tone]) => <div className={`ref-pipeline-step ref-tone-${tone}`} key={name}><strong>{name}</strong><b>{num}</b></div>)}</div></Section>
      <div className="ref-split ref-queue-split"><Section title={`Jobs en cola (${filteredJobs.length})`} className="ref-table-section"><div className="ref-filters ref-queue-filters"><label className="ref-search"><Search size={15}/><input aria-label="Buscar jobs" placeholder="keyword, cuenta o job..." value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filtrar jobs por cuenta" value={jobAccountFilter} onChange={e => setJobAccountFilter(e.target.value)}><option value="all">Todas las cuentas</option>{accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}</select><select aria-label="Filtrar jobs por dispositivo" value={jobDeviceFilter} onChange={e => setJobDeviceFilter(e.target.value)}><option value="all">Todos los dispositivos</option>{[...new Set(accounts.map(a => a.device_serial).filter(Boolean))].map(serial => <option key={serial} value={serial}>{serial}</option>)}</select><select aria-label="Filtrar jobs por estado" value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}><option value="all">Todos los estados</option>{[...new Set(queue.map(j => j.status))].map(state => <option key={state} value={state}>{state.replaceAll('_',' ')}</option>)}</select><button onClick={onOpenCalendar} className="ref-secondary"><CalendarDays size={15}/> Calendario</button></div><div className="ref-table-scroll"><table className="ref-table"><thead><tr><th>Job</th><th>Keyword</th><th>Cuenta</th><th>Dispositivo</th><th>Progreso</th><th>ETA</th><th>Estado</th><th>Prioridad</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>{filteredJobs.map(j => <tr key={j.id} className={selectedQueueJob?.id === j.id ? 'ref-selected' : ''} onClick={() => setSelectedJob(j.id)}><td>{j.id}</td><td><strong>{j.keyword}</strong></td><td>@{accounts.find(a => a.id === j.target_account || a.username === j.target_account)?.username || j.target_account}</td><td>{accounts.find(a => a.id === j.target_account || a.username === j.target_account)?.device_serial || '—'}</td><td><div className="ref-progress"><i style={{ width: `${j.progress ?? (j.status === 'published' ? 100 : 0)}%` }}/></div></td><td>—</td><td><Status tone={badStates.has(j.status) ? 'red' : workingStates.has(j.status) ? 'purple' : j.status === 'published' ? 'green' : 'blue'}>{j.status.replaceAll('_',' ')}</Status></td><td>—</td><td>{j.created_at ? new Date(j.created_at).toLocaleDateString('es-ES') : '—'}</td><td><button className="ref-link" onClick={e => {e.stopPropagation(); onOpenPreview(j);}}>Ver</button></td></tr>)}</tbody></table>{filteredJobs.length === 0 && <p className="ref-empty">No hay jobs que coincidan con la búsqueda.</p>}</div></Section><QueueReferenceDetail job={selectedQueueJob} accounts={accounts} onOpenPreview={onOpenPreview} onOpenCalendar={onOpenCalendar}/></div>
    </>}

    {view === 'proxies' && <><div className="ref-metrics"><Metric label="Proxies activos" value={`${onlineProxies} / ${proxies.length}`} detail="Operativos" tone="blue" icon={<Link2/>}/><Metric label="Proxies inestables" value={proxies.filter(p => p.status !== 'online').length} detail="Requieren revisión" tone="red" icon={<AlertTriangle/>}/><Metric label="Rotación media" value="—" detail="Sin telemetría" tone="blue" icon={<RefreshCw/>}/><Metric label="Latencia media" value={proxies.some(p => p.latency_ms != null) ? `${Math.round(proxies.filter(p => p.latency_ms != null).reduce((n,p) => n+(p.latency_ms ?? 0),0)/proxies.filter(p => p.latency_ms != null).length)} ms` : '—'} detail="Mediciones actuales" tone="purple" icon={<Clock3/>}/></div><ProxyReferenceWorkbench proxies={proxies} onOpenManager={() => onOpenTool('proxies')}/></>}


    {view === 'moneyprinter' && <><div className="ref-metrics"><Metric label="Borradores generados" value={stack.drafts} tone="blue" icon={<FileCode2/>}/><Metric label="Ganchos aprobados" value="—" detail="Sin contador del servidor" tone="green" icon={<CheckCircle2/>}/><Metric label="Vídeos listos" value={queue.filter(j => !!j.video_path).length} tone="purple" icon={<Play/>}/><Metric label="Coste estimado" value="—" detail="Sin datos de coste" tone="yellow" icon={<Zap/>}/></div><MoneyPrinterReferenceWorkbench accounts={accounts} queue={queue} stack={stack} onOpenWizard={() => onOpenTool('moneyprinter')} onOpenJob={onOpenPreview} onRefresh={onRefresh}/></>}

    {view === 'adb' && <><div className="ref-metrics"><Metric label="Dispositivos conectados" value={`${devices.filter(device => device.state === 'device' || device.status === 'device').length} / ${devices.length}`} detail={devices.length ? 'Detectados por ADB' : 'Sin dispositivos detectados'} tone="blue" icon={<Smartphone/>}/><Metric label="Dispositivos offline" value={devices.filter(device => device.state !== 'device' && device.status !== 'device').length} detail="Estado actual" tone="red" icon={<AlertTriangle/>}/><Metric label="Batería media" value={devices.some(device => device.battery_pct != null) ? `${Math.round(devices.reduce((sum, device) => sum + (device.battery_pct ?? 0), 0) / devices.filter(device => device.battery_pct != null).length)}%` : '—'} detail="Dispositivos con telemetría" tone="green" icon={<Smartphone/>}/><Metric label="Latencia ADB (media)" value="—" detail="Sin telemetría" tone="blue" icon={<Zap/>}/></div><AdbReferenceWorkbench devices={devices} accounts={accounts} logs={logs} onRefresh={onRefresh} onConfigure={() => onOpenTool('adb')}/></>}


    {view === 'panda' && <><div className="ref-metrics"><Metric label="Dispositivos en vivo" value={`${deviceCount} / ${accounts.filter(a => a.device_serial).length}`} tone="blue" icon={<Smartphone/>}/><Metric label="Sesiones activas" value={stats.active_bots} tone="green" icon={<Users/>}/><Metric label="Leases en uso" value="—" detail="Sin dato del servidor" tone="purple" icon={<Layers3/>}/><Metric label="Operadores conectados" value="—" detail="Sin dato del servidor" tone="blue" icon={<Users/>}/></div><PandaReferenceGrid accounts={accounts} stats={stats} onOpenLive={() => onOpenTool('panda')}/></>}


    {view === 'curl' && <><div className="ref-metrics"><Metric label="Endpoints disponibles" value={apiEndpointCount ?? '—'} detail="OpenAPI del servidor" tone="blue" icon={<FileCode2/>}/><Metric label="Solicitudes hoy" value="—" detail="Sin contador diario" tone="green" icon={<Send/>}/><Metric label="Errores (4xx/5xx)" value={stats.errores} tone="red" icon={<AlertTriangle/>}/><Metric label="Latencia media" value="—" detail="Sin telemetría" tone="purple" icon={<Clock3/>}/></div><ApiReferenceWorkbench onRun={onRunApi} onCount={setApiEndpointCount}/></>}


    {view === 'code' && <><div className="ref-metrics"><Metric label="Scripts activos" value="—" detail="Código accesible según configuración" tone="blue" icon={<FileCode2/>}/><Metric label="Ejecuciones hoy" value="—" detail="Sin contador diario" tone="purple" icon={<Play/>}/><Metric label="Errores" value={stats.errores} tone="red" icon={<AlertTriangle/>}/><Metric label="Workers Python" value="—" detail="Sin telemetría" tone="green" icon={<Users/>}/></div><PythonReferenceWorkbench logs={logs} onOpenEditor={() => onOpenTool('code')}/></>}

    {view === 'versions' && <><div className="ref-metrics"><Metric label="Versión actual" value={stack.package_version || '—'} detail="Panel" tone="blue" icon={<Layers3/>}/><Metric label="Despliegues este mes" value="—" detail="Sin historial de despliegue" tone="green" icon={<Zap/>}/><Metric label="Entornos activos" value={stack.containers.length || (stack.mode === 'native' ? 1 : 0)} detail="Detectados" tone="purple" icon={<Server/>}/><Metric label="Incidentes" value={stats.errores} tone="red" icon={<AlertTriangle/>}/></div><VersionsReferenceWorkbench stack={stack} onOpenVersionControl={() => onOpenTool('versions')}/></>}

  </div>;
}
