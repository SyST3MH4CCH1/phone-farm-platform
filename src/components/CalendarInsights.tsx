import React, { useState } from 'react';
import { CalendarDays, MoreHorizontal } from 'lucide-react';
import type { Account, QueueJob } from '../types';

const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hours = Array.from({ length: 24 }, (_, hour) => hour);

function scheduledDate(job: QueueJob): Date | null {
  if (!job.scheduled_ts) return null;
  const timestamp = typeof job.scheduled_ts === 'number' ? job.scheduled_ts * 1000 : Date.parse(job.scheduled_ts);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

interface CalendarInsightsProps {
  queue: QueueJob[];
  accounts: Account[];
  onOpenPreview: (job: QueueJob) => void;
  onSchedule: () => void;
}

export function CalendarInsights({ queue, accounts, onOpenPreview, onSchedule }: CalendarInsightsProps) {
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const activity = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  queue.forEach((job) => {
    const date = scheduledDate(job);
    if (date) activity[(date.getDay() + 6) % 7][date.getHours()] += 1;
  });
  const maximum = Math.max(1, ...activity.flat());
  const drafts = queue.filter((job) => !job.scheduled_ts && ['awaiting_approval', 'awaiting_preview', 'ready_for_publish'].includes(job.status));

  return <div className="ref-calendar-insights">
    <section className="ref-section ref-activity-panel" aria-label="Actividad de publicaciones">
      <header className="ref-section-head"><h2>Actividad de publicaciones</h2><span className="ref-segment-active">Por hora</span></header>
      <div className="ref-activity-chart">
        <div className="ref-hour-labels"><span/>{hours.filter((hour) => hour % 2 === 0).map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}</span>)}</div>
        {days.map((day, dayIndex) => <div className="ref-activity-row" key={day}>
          <span>{day}</span>
          {hours.map((hour) => <i key={hour} title={`${day} ${String(hour).padStart(2, '0')}:00 — ${activity[dayIndex][hour]} publicaciones`} style={{ '--heat-opacity': `${activity[dayIndex][hour] / maximum}` } as React.CSSProperties}/>)}
        </div>)}
      </div>
      <footer className="ref-activity-legend"><span>Menos publicaciones</span><i/><i/><i/><i/><span>Más publicaciones</span></footer>
    </section>
    <section className="ref-section ref-drafts-panel" aria-label="Borradores sin programar">
      <header className="ref-section-head"><h2>Borradores sin programar <span className="ref-count-pill">{drafts.length}</span></h2><button className="ref-link" onClick={() => setShowAllDrafts(!showAllDrafts)}>{showAllDrafts ? 'Ver menos' : 'Ver todos'} →</button></header>
      <div className="ref-table-scroll"><table className="ref-table"><thead><tr><th>Vista previa</th><th>Título</th><th>Cuenta</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>
        {(showAllDrafts ? drafts : drafts.slice(0, 5)).map((job) => {
          const account = accounts.find((candidate) => candidate.id === job.target_account || candidate.username === job.target_account);
          const created = new Date(job.created_at);
          return <tr key={job.id}><td><span className="ref-draft-thumbnail"><CalendarDays size={16}/></span></td><td className="ref-draft-title">{job.keyword}</td><td>@{account?.username || job.target_account}</td><td>{Number.isNaN(created.getTime()) ? '—' : created.toLocaleDateString('es-ES')}</td><td><button className="ref-outline-green" onClick={onSchedule}>Programar</button><button className="ref-icon-button" aria-label={`Previsualizar ${job.keyword}`} onClick={() => onOpenPreview(job)}><MoreHorizontal size={17}/></button></td></tr>;
        })}
      </tbody></table>{drafts.length === 0 && <p className="ref-empty">No hay borradores pendientes de programación.</p>}</div>
    </section>
  </div>;
}
