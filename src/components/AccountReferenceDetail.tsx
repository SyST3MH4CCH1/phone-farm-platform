import React, { useState } from 'react';
import { Activity, BarChart3, BriefcaseBusiness, Clock3, ExternalLink, Instagram, Users } from 'lucide-react';
import type { Account, QueueJob } from '../types';
import { AccountWarmupControl } from './AccountWarmupControl';

type Tab = 'resumen' | 'rampa' | 'actividad' | 'trabajos' | 'historial';

export function AccountReferenceDetail({ account, queue, onOpenAccount, onOpenJob }: { account?: Account; queue: QueueJob[]; onOpenAccount: (account: Account) => void; onOpenJob: (job: QueueJob) => void }) {
  const [tab, setTab] = useState<Tab>('resumen');
  const jobs = account ? queue.filter((job) => job.target_account === account.id || job.target_account === account.username) : [];
  const activities = (account?.likes_today ?? 0) + (account?.follows_today ?? 0) + (account?.comments_today ?? 0);
  const status = account?.status === 'active' ? 'Activa' : account?.status === 'warmup' ? 'En riesgo' : account?.status === 'paused' ? 'Pausada' : 'Error';
  return <section className="ref-section ref-account-detail-panel" aria-label="Detalle de cuenta">
    <header className="ref-account-detail-header">
      <span className="ref-account-platform-icon"><Instagram size={23}/></span>
      <div><h2>{account ? `@${account.username}` : 'Selecciona una cuenta'}</h2><div className="ref-account-badges"><span>{account?.platform || 'Plataforma no informada'}</span>{account && <span className={account.status === 'active' ? 'ref-status ref-status-green' : 'ref-status ref-status-yellow'}>{status}</span>}</div></div>
    </header>
    <div className="ref-account-intro"><span className="ref-large-avatar"><Users size={38}/></span><div className="ref-account-totals"><div><strong>{account?.followers_count?.toLocaleString('es-ES') ?? '—'}</strong><span>Seguidores</span></div><div><strong>{account?.following_count?.toLocaleString('es-ES') ?? '—'}</strong><span>Siguiendo</span></div><div><strong>{account?.posts_count?.toLocaleString('es-ES') ?? '—'}</strong><span>Publicaciones</span></div></div></div>
    <p className="ref-account-device">{account?.device_serial || 'Sin dispositivo'} · {account?.created_at ? `Registrada el ${new Date(account.created_at).toLocaleDateString('es-ES')}` : 'Sin fecha de registro'}</p>
    <div className="ref-account-tags">{account?.niche && <span>{account.niche}</span>}{account?.proxy_id && <span>{account.proxy_id}</span>}</div>
    <div className="ref-account-actions"><button className="ref-blue-button" disabled={!account} onClick={() => account && onOpenAccount(account)}><ExternalLink size={15}/> Abrir</button></div>
    <nav className="ref-account-tabs" aria-label="Secciones de cuenta">{(['resumen','rampa','actividad','trabajos','historial'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'trabajos' ? `Trabajos (${jobs.length})` : item === 'rampa' ? 'Rampa' : item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
    {tab === 'rampa' && <div className="ref-account-tab-body">{account ? <AccountWarmupControl key={account.id} account={account}/> : <p>Selecciona una cuenta.</p>}</div>}
    {tab === 'resumen' && <div className="ref-account-tab-body"><div className="ref-account-growth"><div><h3>Crecimiento de seguidores</h3><span>Historial no disponible</span></div><div className="ref-chart-empty"><BarChart3 size={28}/><span>No hay serie histórica para esta cuenta</span></div></div><div className="ref-account-mini-metrics"><div><Activity size={16}/><span>Interacciones hoy</span><strong>{activities}</strong></div><div><Users size={16}/><span>Seguidores</span><strong>{account?.followers_count?.toLocaleString('es-ES') ?? '—'}</strong></div><div><BriefcaseBusiness size={16}/><span>Posts hoy</span><strong>{jobs.filter((job) => job.status === 'published' && !!job.published_at && new Date(job.published_at).toDateString() === new Date().toDateString()).length}</strong></div></div><div className="ref-account-info-block"><h3>Advertencias recientes</h3><p>{account?.status === 'active' ? 'Sin advertencias registradas' : account ? `Estado actual: ${status}` : 'Selecciona una cuenta'}</p></div><div className="ref-account-info-block"><h3>Trabajos vinculados ({jobs.length})</h3>{jobs.slice(0,2).map((job) => <button className="ref-list-row" key={job.id} onClick={() => onOpenJob(job)}><span>{job.keyword}</span><span>{job.status}</span></button>)}{jobs.length === 0 && <p>Sin trabajos vinculados.</p>}</div></div>}
    {tab === 'actividad' && <div className="ref-account-tab-body"><h3><Activity size={16}/> Actividad reciente</h3><p>{account?.last_activity || 'No hay actividad reciente registrada.'}</p><p>Likes: {account?.likes_today ?? 0} · Seguidos: {account?.follows_today ?? 0} · Comentarios: {account?.comments_today ?? 0}</p></div>}
    {tab === 'trabajos' && <div className="ref-account-tab-body"><h3><BriefcaseBusiness size={16}/> Trabajos vinculados</h3>{jobs.map((job) => <button className="ref-list-row" key={job.id} onClick={() => onOpenJob(job)}><span>{job.keyword}</span><span>{job.status}</span></button>)}{jobs.length === 0 && <p>Sin trabajos vinculados.</p>}</div>}
    {tab === 'historial' && <div className="ref-account-tab-body"><h3><Clock3 size={16}/> Historial</h3><p>{account?.last_activity || 'No hay historial de actividad disponible.'}</p></div>}
  </section>;
}
