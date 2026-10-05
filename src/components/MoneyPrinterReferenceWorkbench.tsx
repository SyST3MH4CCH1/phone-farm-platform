import React, { useState } from 'react';
import { CheckCircle2, FileCode2, Film, Image, Music2, Play, Plus, Send, Sparkles, Upload } from 'lucide-react';
import { apiFetch } from '../api';
import type { Account, QueueJob, StackInfo } from '../types';

const templates = [
  { name: 'Producto Viral', description: 'Hook + Demo + CTA', icon: '♪' },
  { name: 'Tips Rápidos', description: 'Lista en 3–5 puntos', icon: '💡' },
  { name: 'Antes / Después', description: 'Transformación visual', icon: '▥' },
  { name: 'POV / Historia', description: 'Storytelling corto', icon: '◉' },
  { name: 'Dato Curioso', description: 'Dato + explicación', icon: '✦' },
  { name: 'Unboxing / Review', description: 'Producto en uso', icon: '◇' },
];
const hooks = ['Transforma tu espacio en 5 minutos', '5 trucos que nadie te cuenta', 'Tu habitación puede verse gigante', 'De desorden a orden en minutos', '5 ideas fáciles para espacios pequeños'];

export function MoneyPrinterReferenceWorkbench({ accounts, queue, stack, onOpenWizard, onOpenJob, onRefresh }: { accounts: Account[]; queue: QueueJob[]; stack: StackInfo; onOpenWizard: () => void; onOpenJob: (job: QueueJob) => void; onRefresh: () => void }) {
  const [template, setTemplate] = useState(templates[0].name);
  const [hook, setHook] = useState(hooks[0]);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [objective, setObjective] = useState('viralidad');
  const [platform, setPlatform] = useState('tiktok');
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [voice, setVoice] = useState('es-ES-AlvaroNeural');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const recent = queue.filter((job) => job.video_path).slice(0, 3);
  const current = queue.find((job) => ['scripting','generating'].includes(job.status));

  const generate = async () => {
    if (!selectedAccount || !prompt.trim()) return;
    setGenerating(true); setMessage('');
    try {
      const guidance = `Plantilla: ${template}. Objetivo: ${objective}. Plataforma: ${platform}. Gancho de ejemplo: ${hook}. Indicaciones: ${prompt.trim()}`;
      const response = await apiFetch('/api/moneyprinter/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ keyword:prompt.trim().slice(0, 200), target_account:selectedAccount.id, custom_prompt:guidance.slice(0, 2000), video_aspect:aspect, voice_name:voice }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage('Borrador enviado a la cola para revisión.'); onRefresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setGenerating(false); }
  };

  return <div className="ref-money-workbench">
    <section className="ref-section ref-money-templates"><nav className="ref-account-tabs"><button className="active">Plantillas</button><button onClick={onOpenWizard}>Workflows</button></nav><button className="ref-blue-button" onClick={onOpenWizard}><Plus size={15}/> Nueva plantilla</button><div className="ref-template-filter"><button className="active">Todas</button><button onClick={() => setTemplate('Producto Viral')}>TikTok</button><button onClick={() => setTemplate('Tips Rápidos')}>Reels</button><button onClick={() => setTemplate('Antes / Después')}>Shorts</button></div><div className="ref-template-list">{templates.map((item) => <button className={template === item.name ? 'active' : ''} key={item.name} onClick={() => setTemplate(item.name)}><span>{item.icon}</span><strong>{item.name}<small>{item.description}</small></strong></button>)}</div><div className="ref-money-lots"><h3>Lotes de contenido</h3>{queue.slice(0,3).map((job) => <button key={job.id} className="ref-list-row" onClick={() => onOpenJob(job)}><span>{job.keyword}</span><small>{job.status}</small></button>)}{queue.length === 0 && <p className="ref-muted">Aún no hay lotes.</p>}</div></section>
    <section className="ref-section ref-money-creator"><header className="ref-section-head"><h2>Creador de contenido</h2><div><button className="ref-secondary" onClick={onOpenWizard}><FileCode2 size={14}/> Configuración</button><button className="ref-primary" onClick={generate} disabled={!selectedAccount || !prompt.trim() || generating}><Sparkles size={15}/>{generating ? 'Enviando…' : 'Crear borrador'}</button></div></header><div className="ref-money-fields"><label>Nicho / temática<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Selecciona una cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>@{account.username}{account.niche ? ` · ${account.niche}` : ''}</option>)}</select></label><label>Objetivo<select value={objective} onChange={(event) => setObjective(event.target.value)}><option value="viralidad">Viralidad</option><option value="alcance">Alcance</option><option value="conversion">Conversión</option></select></label><label>Idioma<select defaultValue="es"><option value="es">Español</option></select></label><label>Plataforma<select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="both">Ambas</option></select></label></div><label className="ref-money-prompt">Prompt del contenido<textarea maxLength={1800} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe el vídeo que quieres crear para esta cuenta..." rows={3}/><small>{prompt.length} caracteres</small></label><div className="ref-money-hooks"><header><h3>Ganchos de ejemplo (5)</h3><button className="ref-link" onClick={onOpenWizard}>Generar más ↻</button></header><div>{hooks.map((item) => <button key={item} className={hook === item ? 'active' : ''} onClick={() => setHook(item)}><span>{item}</span>{hook === item && <CheckCircle2 size={16}/>}</button>)}</div></div><div className="ref-money-bottom"><div className="ref-money-script"><h3>Script / Guion</h3><div><span>Hook</span><p>{hook}</p></div><div><span>Prompt</span><p>{prompt || 'Escribe un prompt para preparar el guion.'}</p></div><button className="ref-secondary" onClick={onOpenWizard}><Sparkles size={14}/> Editar guion</button></div><div className="ref-money-voice"><h3>Voz y formato</h3><label>Voz (TTS)<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="es-ES-AlvaroNeural">Español · Álvaro</option><option value="es-ES-ElviraNeural">Español · Elvira</option></select></label><label>Formato<select value={aspect} onChange={(event) => setAspect(event.target.value as typeof aspect)}><option value="9:16">9:16 (TikTok, Reels, Shorts)</option><option value="16:9">16:9 (Horizontal)</option><option value="1:1">1:1 (Cuadrado)</option></select></label><button onClick={onOpenWizard}><Music2 size={15}/> Música y subtítulos</button><button onClick={onOpenWizard}><Upload size={15}/> Material visual</button></div><div className="ref-money-preview"><h3>Vista previa</h3><div><Image size={32}/><p>{current ? `Generando: ${current.keyword}` : 'El vídeo aparecerá al finalizar la generación.'}</p><button className="ref-secondary" onClick={onOpenWizard}><Play size={14}/> Abrir generador</button></div></div></div>{message && <p className="ref-money-message" role="status">{message}</p>}</section>
    <section className="ref-section ref-money-status"><header className="ref-section-head"><h2>Estado de generación</h2><span>{current ? current.status : 'En espera'}</span></header><div className="ref-money-state"><p><CheckCircle2 size={17}/> Flask <strong>{stack.flask_online ? 'Online' : 'Offline'}</strong></p><p><Film size={17}/> MoneyPrinter <strong>{stack.mpt_online ? 'Online' : 'Offline'}</strong></p>{current && <p><Sparkles size={17}/> {current.keyword} <strong>{current.progress ?? 0}%</strong></p>}</div><div className="ref-money-recent"><h3>Salidas recientes</h3>{recent.map((job) => <button className="ref-list-row" key={job.id} onClick={() => onOpenJob(job)}><Film size={20}/><span>{job.keyword}</span><small>{job.status}</small></button>)}{recent.length === 0 && <p className="ref-muted">Todavía no hay vídeos listos.</p>}</div><div className="ref-money-actions"><button className="ref-secondary" onClick={onOpenWizard}><CheckCircle2 size={15}/> Configurar</button><button className="ref-primary" onClick={generate} disabled={!selectedAccount || !prompt.trim() || generating}><Send size={15}/> Enviar a cola</button></div></section>
  </div>;
}
