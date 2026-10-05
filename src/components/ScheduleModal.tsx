import React, { useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { QueueJob, Account } from '../types';

interface ScheduleModalProps {
  queue: QueueJob[];
  accounts: Account[];
  onClose: () => void;
  onScheduleJob: (keyword: string, targetAccount: string, scheduledTime: string) => Promise<void>;
  onRescheduleJob: (jobId: string, scheduledTime: string) => Promise<void>;
  onRefresh: () => void;
  /**
   * Si `true`, el calendario se monta como panel embebido (sin overlay ni
   * shell modal): ocupa el área de contenido principal cuando la pestaña
   * 'calendario' está seleccionada. Si `false` (default), se muestra como
   * modal centrado con botón ✕ y click-outside-to-close.
   */
  embedded?: boolean;
  /**
   * Si se pasa, se llama al hacer click sobre una píldora del calendario
   * (job ya creado y programado). Sirve para que el dashboard navegue a la
   * sección de Calendario cuando el usuario quiere profundizar.
   * Si es `undefined`, las píldoras no son clickables (modo visual puro).
   */
  onSelectScheduledJob?: (jobId: string) => void;
  /**
   * Si `true`, no se renderiza el formulario de "Programar nueva publicación"
   * en la parte inferior. Útil cuando el calendario es solo de visualización
   * (dashboard) y no se quiere permitir crear nuevas publicaciones desde ahí.
   */
  hideForm?: boolean;
  /** Filtro de cuenta controlado por la página de calendario. */
  externalAccountFilter?: string;
  hideFilterControls?: boolean;
}

type View = 'month' | 'week' | 'day' | 'agenda';
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_H = 44; // px por hora

function tsToDate(ts: unknown): Date | null {
  if (ts == null) return null;
  const n = typeof ts === 'number' ? ts * 1000 : Date.parse(String(ts));
  return Number.isFinite(n) ? new Date(n) : null;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeekDate(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0);
  const dow = (r.getDay() + 6) % 7; // lunes = 0
  r.setDate(r.getDate() - dow);
  return r;
}
const fmtTime = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Calendario de programación estilo Google Calendar — hecho a mano (sin librerías):
 *  vista mes (píldoras), semana y día (tramos de horas), agenda, filtros por cuenta/terminal.
 *  Drag & drop: arrastra píldoras entre días/horas para reprogramar. */
export const ScheduleModal: React.FC<ScheduleModalProps> = ({ queue, accounts, onClose, onScheduleJob, onRescheduleJob, onRefresh, embedded = false, onSelectScheduledJob, hideForm = false, externalAccountFilter, hideFilterControls = false }) => {
  const now = new Date();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'terminal' | 'account' | 'platform' | 'status'>('all');
  const [filterValue, setFilterValue] = useState('');

  const [kw, setKw] = useState('');
  const [accId, setAccId] = useState(accounts[0]?.id || '');
  const [formDate, setFormDate] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- Drag & Drop state ---
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null); // ISO date key for highlight
  const [dragOverHour, setDragOverHour] = useState<number | null>(null); // hour slot in week/day

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  const accountOf = (job: QueueJob) => accounts.find(a => a.id === job.target_account);
  const terminals = useMemo(() => [...new Set(accounts.map(a => a.device_serial).filter(Boolean))], [accounts]);

  const pillColors = ['#4285F4', '#34A853', '#EA4335', '#FBBC04', '#A142F4', '#12B5CB', '#F4511E', '#188038'];
  const colorOf = (job: QueueJob) => pillColors[Math.max(0, accounts.findIndex(a => a.id === job.target_account)) % pillColors.length];

  const scheduled = useMemo(() => queue
    .map(j => ({ job: j, date: tsToDate(j.scheduled_ts) }))
    .filter((x): x is { job: QueueJob; date: Date } => x.date !== null)
    .filter(({ job }) => {
      if (externalAccountFilter && externalAccountFilter !== 'all') return job.target_account === externalAccountFilter || accountOf(job)?.id === externalAccountFilter;
      if (filterType === 'all') return true;
      if (filterType === 'account') return job.target_account === filterValue;
      if (filterType === 'terminal') return accountOf(job)?.device_serial === filterValue;
      if (filterType === 'platform') return accountOf(job)?.platform === filterValue;
      if (filterType === 'status') return job.status === filterValue;
      return true;
    }), [queue, filterType, filterValue, externalAccountFilter]);

  const byDay = (d: Date) => scheduled.filter(({ date }) => sameDay(date, d));

  // --- Navegación ---
  const nav = (delta: number) => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else {
      const d = new Date(cursor);
      d.setDate(d.getDate() + (view === 'day' ? delta : delta * 7));
      setCursor(d);
    }
  };
  const goToday = () => {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(null);
  };

  // --- Grid del mes ---
  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = (first.getDay() + 6) % 7;
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // --- Semana/día: días visibles ---
  const visibleDays = useMemo(() => {
    if (view === 'day') return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())];
    const start = startOfWeekDate(cursor);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view, cursor]);

  const weekLabel = view === 'day'
    ? `${cursor.getDate()} ${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : `${fmtTime(visibleDays[0])} — ${fmtTime(visibleDays[6])} · ${MONTHS[visibleDays[0].getMonth()]} ${visibleDays[0].getFullYear()}`;

  const submit = async () => {
    if (!kw.trim() || !accId || !formDate) {
      setMsg({ ok: false, text: 'Keyword, cuenta y fecha/hora son obligatorios.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await onScheduleJob(kw.trim(), accId, new Date(formDate).toISOString());
      setMsg({ ok: true, text: `Programado para ${formDate.replace('T', ' ')}.` });
      setKw(''); onRefresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  // --- Drag & Drop handlers ---
  const handleDragStart = useCallback((e: React.DragEvent, jobId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', jobId);
    setDragJobId(jobId);
    // Make drag image semi-transparent
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => { el.style.opacity = '0.4'; });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setDragJobId(null);
    setDragOverDate(null);
    setDragOverHour(null);
  }, []);

  const handleDragOverDay = useCallback((e: React.DragEvent, dateKey: string) => {
    if (!dragJobId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateKey) setDragOverDate(dateKey);
  }, [dragJobId, dragOverDate]);

  const handleDragOverSlot = useCallback((e: React.DragEvent, dateKey: string, hour: number) => {
    if (!dragJobId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateKey || dragOverHour !== hour) {
      setDragOverDate(dateKey);
      setDragOverHour(hour);
    }
  }, [dragJobId, dragOverDate, dragOverHour]);

  const handleDropOnDay = useCallback(async (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    setDragOverHour(null);
    const jobId = e.dataTransfer.getData('text/plain') || dragJobId;
    if (!jobId) return;

    const draggedJob = scheduled.find(s => s.job.id === jobId);
    // Keep the original time (or default to 12:00) and only change the date
    const originalDate = draggedJob?.date;
    const hours = originalDate ? originalDate.getHours() : 12;
    const minutes = originalDate ? originalDate.getMinutes() : 0;
    const newDate = new Date(targetDay);
    newDate.setHours(hours, minutes, 0, 0);
    
    try {
      await onRescheduleJob(jobId, newDate.toISOString());
      setMsg({ ok: true, text: `${jobId} movido a ${newDate.toLocaleDateString('es-ES')}.` });
      onRefresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }, [dragJobId, scheduled, onRescheduleJob, onRefresh]);

  const handleDropOnSlot = useCallback(async (e: React.DragEvent, targetDay: Date, hour: number) => {
    e.preventDefault();
    setDragOverDate(null);
    setDragOverHour(null);
    const jobId = e.dataTransfer.getData('text/plain') || dragJobId;
    if (!jobId) return;

    const newDate = new Date(targetDay);
    newDate.setHours(hour, 0, 0, 0);
    
    try {
      await onRescheduleJob(jobId, newDate.toISOString());
      setMsg({ ok: true, text: `${jobId} movido a ${newDate.toLocaleString('es-ES')}.` });
      onRefresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }, [dragJobId, onRescheduleJob, onRefresh]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const viewBtn = (v: View, label: string) => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`px-3 py-1 rounded text-[11px] font-mono transition-colors ${
        view === v ? 'bg-[#0284c7] text-white font-semibold shadow-sm' : 'bg-[var(--color-surface-3)] text-[#9aafc5] hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  // Cuerpo del calendario (toolbar + filtros + grid + form) — compartido entre
  // el modo modal (con overlay) y el modo embebido (panel de pestaña).
  const body = (
    <div className="flex-1 overflow-y-auto p-3" style={{ background: 'var(--color-surface)' }}>
          {/* Toolbar estilo Dashboard */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b" style={{ borderColor: 'var(--color-line)' }}>
            <div className="flex items-center gap-1.5">
              <button onClick={goToday} className="px-3 py-1 rounded text-xs bg-[var(--color-surface-3)] text-gray-200 border border-[var(--color-line)] hover:bg-[var(--color-surface-4)] font-mono">Hoy</button>
              <button onClick={() => nav(-1)} className="px-2 py-1 rounded text-xs bg-[var(--color-surface-3)] text-gray-200 border border-[var(--color-line)] hover:bg-[var(--color-surface-4)] font-mono">←</button>
              <button onClick={() => nav(1)} className="px-2 py-1 rounded text-xs bg-[var(--color-surface-3)] text-gray-200 border border-[var(--color-line)] hover:bg-[var(--color-surface-4)] font-mono">→</button>
              <span className="text-sm font-bold text-white capitalize ml-2 font-mono">
                {view === 'month' ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}` : weekLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">{viewBtn('month', 'Mes')}{viewBtn('week', 'Semana')}{viewBtn('day', 'Día')}{viewBtn('agenda', 'Agenda')}</div>
          </div>

          {/* Filtros */}
          {!hideForm && !hideFilterControls && (
            <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] font-mono">
              <span className="text-[#6B7076] uppercase tracking-wider">Ver:</span>
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value as any); setFilterValue(''); }} className="input px-2 py-1 text-[11px]">
                <option value="all">Global (todas las cuentas)</option>
                <option value="account">Por cuenta</option>
                <option value="terminal">Por terminal</option>
                <option value="platform">Por plataforma</option>
                <option value="status">Por estado</option>
              </select>
              {filterType === 'account' && (
                <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="input px-2 py-1 text-[11px]">
                  <option value="">— selecciona —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              )}
              {filterType === 'terminal' && (
                <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="input px-2 py-1 text-[11px]">
                  <option value="">— selecciona —</option>
                  {terminals.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              {filterType === 'platform' && (
                <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="input px-2 py-1 text-[11px]">
                  <option value="">— selecciona —</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="both">Instagram + TikTok</option>
                </select>
              )}
              {filterType === 'status' && (
                <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="input px-2 py-1 text-[11px]">
                  <option value="">— selecciona —</option>
                  <option value="pending">Queued</option>
                  <option value="scripting">Scripting</option>
                  <option value="generating">Generating</option>
                  <option value="awaiting_approval">Awaiting approval</option>
                  <option value="awaiting_preview">Awaiting preview</option>
                  <option value="ready_for_publish">Ready</option>
                  <option value="publishing">Publishing</option>
                  <option value="published">Published</option>
                  <option value="failed">Failed</option>
                  <option value="rejected">Rejected</option>
                  <option value="awaiting_manual_upload">Manual upload</option>
                </select>
              )}
            </div>
          )}

          {/* ============ VISTA MES ============ */}
          {view === 'month' && (
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
              <div className="grid grid-cols-7 border-b text-[11px] font-semibold text-[#64748b] uppercase text-center py-1.5" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface-2)' }}>
                {DOW.map(d => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((day, i) => day === null ? (
                  <div key={`e${i}`} className="min-h-[46px] border-b border-r opacity-20" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }} />
                ) : (
                  <div
                    key={day.toISOString()}
                    onClick={() => { setSelectedDay(day); setFormDate(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T12:00`); }}
                    onDragOver={(e) => handleDragOverDay(e, dayKey(day))}
                    onDrop={(e) => handleDropOnDay(e, day)}
                    className={`min-h-[46px] p-1 border-b border-r cursor-pointer transition-colors relative ${
                      sameDay(day, now) ? 'bg-[#132338]' : 'hover:bg-[var(--color-surface-2)]'
                    } ${dragOverDate === dayKey(day) ? '!bg-[#1a3a5c] ring-2 ring-[#0284c7]' : ''}`}
                    style={{ borderColor: 'var(--color-line)' }}
                  >
                    {dragOverDate === dayKey(day) && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[11px] text-[#0284c7] font-bold bg-[#1a3a5c] px-2 py-1 rounded">Soltar aquí</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[11px] font-mono ${
                        sameDay(day, now) ? 'bg-[#0284c7] text-white font-bold' : 'text-[#9aafc5]'
                      }`}>
                        {day.getDate()}
                      </span>
                      {byDay(day).length > 0 && (
                        <span className="flex items-center gap-1" aria-label={`${byDay(day).length} publicaciones programadas`}>
                          {byDay(day).slice(0, 3).map(({ job }) => <span key={job.id} className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: colorOf(job) }} />)}
                          {byDay(day).length > 3 && <span className="text-[10px] font-mono text-gray-300 font-semibold">+{byDay(day).length - 3}</span>}
                        </span>
                      )}
                    </div>
                    {!hideForm && (
                      <div className="space-y-0.5 mt-1">
                        {byDay(day).slice(0, 2).map(({ job, date }) => (
                          <div
                            key={job.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, job.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => onSelectScheduledJob?.(job.id)}
                            className="truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-[#E8EAED] border-l-[3px] cursor-grab active:cursor-grabbing"
                            style={{ background: `${colorOf(job)}1F`, borderLeftColor: colorOf(job) }}
                            title={`${job.id} · ${job.keyword} · ${fmtTime(date)}`}
                          >
                            {fmtTime(date)} {job.keyword}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============ VISTA SEMANA / DÍA (tramos de horas) ============ */}
          {(view === 'week' || view === 'day') && (
            <div className="border border-[#3c4043] rounded-lg overflow-hidden bg-[#292a2d]">
              {/* Header días */}
              <div className="grid border-b border-[#3c4043]" style={{ gridTemplateColumns: `52px repeat(${visibleDays.length}, 1fr)` }}>
                <div />
                {visibleDays.map(d => (
                  <div key={d.toISOString()} className="py-2 text-center">
                    <div className="text-[10px] uppercase text-[#9aa0a6]">{DOW[(d.getDay() + 6) % 7]}</div>
                    <div className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-[13px] mt-0.5 ${
                      sameDay(d, now) ? 'bg-[#8ab4f8] text-[#202124] font-semibold' : 'text-[#E8EAED]'
                    }`}>
                      {d.getDate()}
                    </div>
                  </div>
                ))}
              </div>
              {/* Grid horas con drop zones */}
              <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
                <div className="relative" style={{ height: HOURS.length * SLOT_H }}>
                  {/* Grid de slots de hora — cada celda es drop target */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `52px repeat(${visibleDays.length}, 1fr)` }}>
                    {HOURS.map(h => (
                      <div key={h} className="contents">
                        <div className="text-[10px] text-[#9aa0a6] text-right pr-2 -mt-1.5">{`${String(h).padStart(2, '0')}:00`}</div>
                        {visibleDays.map(d => (
                          <div
                            key={`${dayKey(d)}-${h}`}
                            onDragOver={(e) => handleDragOverSlot(e, `${dayKey(d)}-${h}`, h)}
                            onDrop={(e) => handleDropOnSlot(e, d, h)}
                            className={`border-t border-[#33363a] transition-colors relative ${
                              dragOverDate === `${dayKey(d)}-${h}` ? 'bg-[#1a3a5c] ring-1 ring-inset ring-[#8ab4f8]' : ''
                            }`}
                          >
                            {dragOverDate === `${dayKey(d)}-${h}` && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                                <span className="text-[10px] text-[#8ab4f8] font-bold bg-[#1a3a5c] px-1.5 py-0.5 rounded">Soltar aquí</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* Eventos posicionados por hora */}
                  {visibleDays.map((d) => byDay(d).map(({ job, date }) => {
                    const top = (date.getHours() + date.getMinutes() / 60) * SLOT_H;
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, job.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onSelectScheduledJob?.(job.id)}
                        className="absolute mx-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#E8EAED] border-l-[4px] overflow-hidden whitespace-nowrap cursor-grab active:cursor-grabbing z-10"
                        style={{
                          top,
                          height: SLOT_H - 3,
                          left: `calc(52px + ${visibleDays.indexOf(d) * (100 / visibleDays.length)}%)`,
                          width: `calc(${100 / visibleDays.length}% - 8px)`,
                          background: `${colorOf(job)}1F`,
                          borderLeftColor: colorOf(job),
                        }}
                        title={`${job.id} · ${job.keyword} — arrastrar para reprogramar`}
                      >
                        {fmtTime(date)} {job.keyword}
                      </div>
                    );
                  }))}
                  {/* Línea "ahora" */}
                  {visibleDays.some(d => sameDay(d, now)) && (
                    <div
                      className="absolute left-[52px] right-0 border-t-2 border-[#ea4335] z-10"
                      style={{ top: (now.getHours() + now.getMinutes() / 60) * SLOT_H }}
                    >
                      <span className="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-[#ea4335]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============ VISTA AGENDA ============ */}
          {view === 'agenda' && (
            <div className="border border-[#3c4043] rounded-lg overflow-hidden bg-[#292a2d]">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-[#323639] text-[#9aa0a6] uppercase text-[10px]">
                    <th className="py-2 px-3">Fecha</th>
                    <th className="py-2 px-3">Hora</th>
                    <th className="py-2 px-3">Publicación</th>
                    <th className="py-2 px-3">Cuenta</th>
                    <th className="py-2 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-[#9aa0a6]">Sin publicaciones programadas.</td></tr>
                  )}
                  {[...scheduled].sort((a, b) => a.date.getTime() - b.date.getTime()).map(({ job, date }) => (
                    <tr
                      key={job.id}
                      onClick={() => onSelectScheduledJob?.(job.id)}
                      className={`border-t border-[#3c4043] ${onSelectScheduledJob ? 'cursor-pointer hover:bg-[#2f3133]' : ''}`}
                    >
                      <td className="py-2 px-3 text-[#E8EAED]">{date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                      <td className="py-2 px-3 text-[#9aa0a6]">{fmtTime(date)}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 border-l-[4px] text-[#E8EAED]" style={{ background: `${colorOf(job)}1F`, borderLeftColor: colorOf(job) }}>
                          {job.keyword}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[#9aa0a6]">@{accountOf(job)?.username || job.target_account}</td>
                      <td className="py-2 px-3 text-[#9aa0a6]">{job.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Formulario rápido (oculto en modo dashboard/visual) */}
          {!hideForm && (
          <div id="schedule-quick-form" className="mt-3 border-t border-[#2A2C30] pt-3">
            <div className="font-mono text-xs font-bold text-[#E5E5E5] mb-2">
              Programar nueva publicación
              {selectedDay && view === 'month' && <span className="text-[#6B7076] font-normal"> — {selectedDay.getDate()} {MONTHS[selectedDay.getMonth()]}</span>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-wrap items-end gap-2 bg-[#232528] border border-[#2A2C30] rounded-md p-3 font-mono text-[11px]">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[#6B7076] mb-1 uppercase text-[10px]">Keyword</label>
                <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="keyword del reel" className="input w-full px-2 py-1.5 text-[11px]" />
              </div>
              <div>
                <label className="block text-[#6B7076] mb-1 uppercase text-[10px]">Cuenta</label>
                <select value={accId} onChange={(e) => setAccId(e.target.value)} className="input px-2 py-1.5 text-[11px]">
                  {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[#6B7076] mb-1 uppercase text-[10px]">Fecha y hora</label>
                <input type="datetime-local" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="input px-2 py-1.5 text-[11px]" />
              </div>
              <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-xs">{busy ? 'Programando...' : 'Programar'}</button>
            </form>
            {msg && <p className={`mt-2 text-[11px] font-mono ${msg.ok ? 'text-[#6FBF73]' : 'text-[#E05B5B]'}`}>{msg.text}</p>}
          </div>
          )}
        </div>
  );

  if (embedded) {
    // Modo panel: ocupa el área de contenido de la pestaña 'calendario'.
    // Sin motion.div ni overlay, sin botón ✕ — la pestaña es persistente.
    return (
      <div
        ref={containerRef}
        className="h-full flex flex-col"
        role="region"
        aria-label="Calendario de programación"
      >
        {body}
      </div>
    );
  }

  // Modo modal: overlay + shell + botón ✕ + click-outside-to-close.
  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        className="modal-shell w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header flex items-center justify-end px-2">
          <button onClick={onClose} className="btn-close font-bold" title="Cerrar">✕</button>
        </div>
        {body}
      </motion.div>
    </div>
  );
};
