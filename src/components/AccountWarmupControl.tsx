import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, PauseCircle, PlayCircle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api';
import type { Account } from '../types';

type Step = 'ownership' | 'profile' | 'security' | 'content' | 'oauth';
type WarmupAccount = {
  account_id: string; state: string; platform: 'instagram' | 'tiktok' | null;
  registered: boolean; account_emergency_stop: boolean; phase_day: number | null;
  remaining_today: number | null; successes: number; incidents: number;
  paused_until: number | null; completed_steps: Step[];
};
type Status = { dry_run: boolean; emergency_stop: boolean; real_enabled: boolean; accounts: WarmupAccount[] };
const steps: { id: Step; label: string; detail: string }[] = [
  { id: 'ownership', label: 'Titularidad y región', detail: 'Confirmé que la cuenta y su ubicación declarada son auténticas.' },
  { id: 'profile', label: 'Perfil completo', detail: 'Revisé usuario, foto, bio y categoría en la app oficial.' },
  { id: 'security', label: 'Acceso seguro', detail: 'Verifiqué correo, recuperación y autenticación en dos pasos.' },
  { id: 'content', label: 'Contenido revisado', detail: 'Revisé derechos, originalidad, privacidad y etiqueta de IA cuando procede.' },
  { id: 'oauth', label: 'Autorización oficial', detail: 'Conecté la cuenta mediante OAuth oficial y permisos mínimos. Marcado manual; esta app aún no verifica la conexión.' },
];

export function AccountWarmupControl({ account }: { account: Account }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null); setError('');
    apiFetch('/api/warmup/status', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`Estado no disponible (HTTP ${response.status})`);
      setStatus(await response.json() as Status);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [account.id]);
  const item = status?.accounts.find(row => row.account_id === account.id);
  async function mutate(action: 'register' | 'emergency-stop' | 'step', body: object) {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/warmup/accounts/${encodeURIComponent(account.id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json() as Status & { error?: string };
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setStatus(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <div className="ref-warmup-control" aria-label={`Rampa de publicación de @${account.username}`}>
    <div className="ref-warmup-hero"><ShieldCheck size={21}/><div><h3>Preparación de @{account.username}</h3><p>Checklist manual y control de seguridad por cuenta</p></div></div>
    {error && <p className="ref-warmup-error" role="alert">{error}</p>}
    {!status && !error && <p>Cargando estado…</p>}
    {status && <>
      <div className="ref-warmup-facts"><span><b>Motor</b>{status.dry_run ? 'Simulación' : 'No verificado'}</span><span><b>Publicación real</b>{status.real_enabled ? 'Disponible' : 'Bloqueada'}</span><span><b>Estado</b>{item?.state === 'NOT_REGISTERED' ? 'Sin preparar' : item?.state || 'Sin dato'}</span></div>
      {status.emergency_stop && <p className="ref-warmup-notice"><AlertTriangle size={15}/> El interruptor global sigue activo. Los pasos completados no habilitan publicaciones.</p>}
      {!item?.registered ? <div className="ref-warmup-register"><p>Registra esta cuenta para guardar el checklist y controlar su pausa. Esto no conecta TikTok ni Instagram.</p><label>Plataforma real<select value={platform} onChange={event => setPlatform(event.target.value as 'instagram' | 'tiktok')}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label><button className="ref-blue-button" disabled={busy} onClick={() => mutate('register', { platform })}>Preparar cuenta</button></div> : <>
        <div className="ref-warmup-facts"><span><b>Plataforma</b>{item.platform}</span><span><b>Fase interna</b>Día {item.phase_day ?? '—'}</span><span><b>Cupo verificado</b>{item.remaining_today ?? 'Sin confirmar'}</span></div>
        <div className="ref-warmup-steps"><h3>Pasos que controlas tú</h3>{steps.map(step => <label key={step.id} className="ref-warmup-step"><input type="checkbox" checked={item.completed_steps.includes(step.id)} disabled={busy} onChange={event => mutate('step', { step: step.id, completed: event.target.checked })}/><span><strong>{step.label}</strong><small>{step.detail}</small></span></label>)}</div>
        <div className="ref-warmup-safety"><div><h3>{item.account_emergency_stop ? 'Cuenta pausada' : 'Pausa de esta cuenta'}</h3><p>Control local de la rampa. El bloqueo global y la falta de OAuth oficial siguen impidiendo la publicación real.</p></div><button className={item.account_emergency_stop ? 'ref-blue-button' : 'ref-danger-button'} disabled={busy} onClick={() => mutate('emergency-stop', { stopped: !item.account_emergency_stop })}>{item.account_emergency_stop ? <><PlayCircle size={15}/> Quitar pausa local</> : <><PauseCircle size={15}/> Pausar cuenta</>}</button></div>
      </>}
      <p className="ref-warmup-footnote"><CheckCircle2 size={14}/> Marcar pasos registra tu revisión; no certifica permisos OAuth, región ni límites de la plataforma.</p>
    </>}
  </div>;
}
