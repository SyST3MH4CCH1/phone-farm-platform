import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Account, ProxyItem, QueueJob, LogEntry, SystemStats, AuthUser, StackInfo, DraftPost } from './types';
import { Header, ActiveTab } from './components/Header';
import { AccountsPanel } from './components/AccountsPanel';
import { QueuePanel } from './components/QueuePanel';
import { AlertRow, StatusBadge } from './components/design';
import { PandaGridModal } from './components/PandaGridModal';
import { TerminalLogs } from './components/TerminalLogs';
import { ProxyModal } from './components/ProxyModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { CurlTesterModal } from './components/CurlTesterModal';
import { AdbBridgeModal } from './components/AdbBridgeModal';
import { ScheduleModal } from './components/ScheduleModal';
import { LoginScreen } from './components/LoginScreen';
import { MoneyPrinterModal } from './components/MoneyPrinterModal';
import { PostPreviewModal } from './components/PostPreviewModal';
import { AccountDetailModal } from './components/AccountDetailModal';
import { VersionControlModal } from './components/VersionControlModal';
import { apiFetch } from './api';

// Estado inicial VACÍO — los datos REALES se cargan desde el backend Flask.
// CERO datos de ejemplo: la UI refleja exclusivamente el estado del servidor.
const EMPTY_STATS: SystemStats = {
  videos_subidos: 0,
  acciones_hoy: 0,
  errores: 0,
  cpu_percent: 0,
  ram_percent: 0,
  active_bots: 0,
  active_proxies: 0,
  panda_grid_status: 'Disconnected'
};

/**
 * StatCard — tarjeta de estadística reusable para el Dashboard.
 * Soporta colores brand, OK/warn/danger y ring de progreso opcional.
 */
const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  hint?: string;
  tone?: 'brand' | 'ok' | 'warn' | 'danger';
  icon: React.ReactNode;
  ring?: number; // 0-100; si está presente muestra un anillo SVG
  bar?: number;  // 0-100; si está presente muestra barra horizontal
  extra?: React.ReactNode;
}> = ({ title, value, subtitle, hint, tone = 'brand', icon, ring, bar, extra }) => {
  const accent = tone === 'ok' ? '#00FF88'
    : tone === 'warn' ? '#FFB800'
    : tone === 'danger' ? '#FF3B5C'
    : '#8ab4f8';
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1.5 min-w-0 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--color-muted-2)' }}>
          {title}
        </span>
        <span className="shrink-0" style={{ color: accent }}>{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[22px] font-bold font-mono leading-none truncate" style={{ color: 'var(--color-text)' }}>{value}</div>
          {subtitle && (
            <div className="text-[10px] font-mono mt-1 truncate" style={{ color: 'var(--color-muted)' }}>{subtitle}</div>
          )}
          {hint && (
            <div className="text-[10px] font-mono mt-0.5" style={{ color: accent }}>{hint}</div>
          )}
          {bar !== undefined && (
            <div className="h-1.5 mt-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: accent }}
              />
            </div>
          )}
        </div>
        {ring !== undefined && (
          <RingProgress percent={ring} color={accent} size={36} />
        )}
        {extra}
      </div>
    </div>
  );
};

/** Mini anillo SVG para ring de porcentaje. */
const RingProgress: React.FC<{ percent: number; color: string; size?: number }> = ({ percent, color, size = 36 }) => {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
    </svg>
  );
};

/** Mini barra de progreso horizontal. */
const MiniBar: React.FC<{ percent: number; color?: string; right?: string }> = ({ percent, color = '#8ab4f8', right }) => (
  <div className="flex items-center gap-2 text-[10px] font-mono">
    {right && <span className="shrink-0 tabular-nums" style={{ color: 'var(--color-muted)' }}>{right}</span>}
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }} />
    </div>
  </div>
);

/**
 * DevicesCard — bloque de resumen de dispositivos ADB.
 * Muestra los seriales reales reportados por `/api/adb/devices` y la cantidad
 * `deviceCount` que llega del backend. Si el array llega vacío, estado vacío
 * real (no fake data).
 */
const DevicesCard: React.FC<{ deviceCount: number }> = ({ deviceCount }) => (
  <div className="rounded-lg p-3 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}>
    <h3 className="text-[11px] font-mono uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
      Dispositivos
    </h3>
    <div className="flex items-baseline gap-2 mb-2">
      <span className="text-[28px] font-bold font-mono leading-none" style={{ color: '#00FF88' }}>{deviceCount}</span>
      <span className="text-[11px] font-mono" style={{ color: 'var(--color-muted)' }}>conectados</span>
    </div>
    <div className="text-[10px] font-mono" style={{ color: 'var(--color-muted-2)' }}>
      {deviceCount === 0 ? (
        <span style={{ color: 'var(--color-muted)' }}>
          Sin dispositivos ADB detectados. Conecta un dispositivo y ejecuta `adb devices`.
        </span>
      ) : (
        <span>Fuente: <code style={{ color: 'var(--color-text)' }}>/api/adb/devices</code></span>
      )}
    </div>
  </div>
);

/**
 * ProxiesCard — bloque de resumen de proxies.
 * Recibe `proxies` (ya sliceados a 4) y muestra latencia real. Si `latency_ms`
 * no está medido (null/undefined), se muestra '—' (sin fake data).
 */
const ProxiesCard: React.FC<{ proxies: ProxyItem[] }> = ({ proxies }) => (
  <div className="rounded-lg p-3 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}>
    <h3 className="text-[11px] font-mono uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
      Proxies
    </h3>
    <div className="flex items-baseline gap-2 mb-2">
      <span className="text-[28px] font-bold font-mono leading-none" style={{ color: '#8ab4f8' }}>{proxies.length}</span>
      <span className="text-[11px] font-mono" style={{ color: 'var(--color-muted)' }}>visibles</span>
    </div>
    <div className="space-y-1.5">
      {proxies.length === 0 ? (
        <div className="text-[10px] font-mono" style={{ color: 'var(--color-muted)' }}>
          Sin proxies configurados. Agrega uno en la pestaña Cuentas.
        </div>
      ) : (
        proxies.map((p) => {
          const latency = (p as any).latency_ms;
          const hasLatency = typeof latency === 'number' && Number.isFinite(latency);
          const status = (p as any).status as string | undefined;
          const tone = hasLatency ? (latency < 200 ? 'ok' : latency < 500 ? 'warn' : 'danger') : 'warn';
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="truncate" style={{ color: 'var(--color-text)' }}>{p.host || p.id}</span>
              <span
                className="shrink-0 tabular-nums"
                style={{
                  color: tone === 'ok' ? '#00FF88' : tone === 'warn' ? '#FFB800' : '#FF3B5C',
                }}
              >
                {hasLatency ? `${Math.round(latency)} ms` : '—'}
                {status && <span style={{ color: 'var(--color-muted-2)' }}> · {status}</span>}
              </span>
            </div>
          );
        })
      )}
    </div>
  </div>
);

/**
 * DashboardView — replica la home del dashboard con stat cards arriba y
 * abajo, y luego la fila de 3 columnas (Cuentas | Cola | mini calendario).
 */
const DashboardView: React.FC<{
  accounts: Account[];
  queue: QueueJob[];
  proxies: ProxyItem[];
  stats: SystemStats;
  deviceCount: number;
  stack: StackInfo | null;
  onAddAccount: (acc: Partial<Account>) => void;
  onDeleteAccount: (accountId: string) => void;
  onSelectAccountForDetail: (acc: Account) => void;
  onAddJob: (keyword: string, targetAccount: string) => void;
  onProcessNextJob: () => void;
  onOpenPreview: (job: QueueJob) => void;
  onApproveJob: (jobId: string) => void;
  onPublishJob: (jobId: string, version: number) => void;
  onMarkReady: (jobId: string) => void;
  onRejectJob: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
  isProcessingJob: boolean;
  onScheduleJob: (kw: string, acc: string, ts: string) => Promise<void>;
  onRescheduleJob: (jobId: string, ts: string) => Promise<void>;
  refreshBackendData: () => void;
  onSelectScheduledJob: () => void;
}> = (props) => {
  const {
    accounts, queue, proxies, stats, deviceCount, stack,
    onAddAccount, onDeleteAccount, onSelectAccountForDetail,
    onAddJob, onProcessNextJob, onOpenPreview, onApproveJob,
    onPublishJob, onMarkReady, onRejectJob, onDeleteJob, isProcessingJob,
    onScheduleJob, onRescheduleJob, refreshBackendData, onSelectScheduledJob,
  } = props;
  // Cuenta SOLO las cuentas realmente activas; cuando no hay cuentas o ninguna
  // está activa, onlineCount === 0 (no se simula con un fallback a accounts.length).
  const onlineCount = accounts.filter(a => a.status === 'active').length;
  const jobsRunning = queue.filter(j => j.status === 'generating' || j.status === 'publishing' || j.status === 'scripting').length;
  const publishedToday = queue.filter(j => j.status === 'published').length;
  const successRate = stats.errores === 0 ? 100 : Math.max(0, Math.round(100 - (stats.errores / Math.max(1, queue.length)) * 100));
  const successTone: 'ok' | 'warn' | 'danger' = successRate >= 90 ? 'ok' : successRate >= 70 ? 'warn' : 'danger';
  const alerts = stats.errores;
  const diskPercent = (stats as any).disk_percent as number | null | undefined;
  // Proxies reales del backend; si latency_ms no está medido, mostramos '—'.
  const realProxies = proxies.length > 0 ? proxies.slice(0, 4) : [];
  return (
    <div className="p-3 space-y-3">
      {/* Fila 1: 5 stat cards principales */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <StatCard
          title="Dispositivos"
          value={`${deviceCount}`}
          subtitle={deviceCount > 0 ? "Online" : "Sin dispositivos ADB"}
          tone={deviceCount > 0 ? "ok" : "warn"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>}
        />
        <StatCard
          title="Cuentas activas"
          value={`${onlineCount}`}
          subtitle={
            accounts.length > 0
              ? `de ${accounts.length} registradas`
              : "Sin cuentas registradas"
          }
          tone={onlineCount > 0 ? "brand" : "warn"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          bar={
            accounts.length > 0
              ? Math.min(100, Math.round((onlineCount / accounts.length) * 100))
              : 0
          }
        />
        <StatCard
          title="Jobs en ejecución"
          value={`${jobsRunning}`}
          subtitle={`en cola: ${Math.max(0, queue.length - jobsRunning)}`}
          tone="brand"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
        />
        <StatCard
          title="Publicaciones"
          value={`${publishedToday}`}
          subtitle={
            stack
              ? `MPT: ${stack.mpt_online ? "online" : "offline"} · drafts: ${stack.drafts}`
              : "Fuente: /api/queue"
          }
          tone="ok"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>}
          ring={queue.length > 0 ? Math.round((publishedToday / queue.length) * 100) : 0}
        />
        <StatCard
          title="Tasa de éxito"
          value={`${successRate}%`}
          subtitle={`${queue.length - stats.errores}/${queue.length}`}
          tone={successTone}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>}
          ring={successRate}
        />
        <StatCard
          title="Alertas"
          value={`${alerts}`}
          subtitle={alerts > 0 ? 'Requieren acción' : 'Todo en orden'}
          tone={alerts > 0 ? 'danger' : 'ok'}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
        />
      </div>

      {/* Fila 2: 4 stat cards de infraestructura */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {/* Estadísticas de publicación */}
        <div className="rounded-lg p-3 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}>
          <h3 className="text-[11px] font-mono uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            Estadísticas de publicación
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Hoy" value={publishedToday.toString()} tone="brand" />
            <MiniStat label="Tasa" value={`${successRate}%`} tone="ok" />
            <MiniStat label="En cola" value={(queue.length - jobsRunning).toString()} tone="warn" />
          </div>
        </div>

        {/* Uso del sistema */}
        <div className="rounded-lg p-3 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}>
          <h3 className="text-[11px] font-mono uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            Uso del sistema (servidor)
          </h3>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <RingProgress percent={stats.cpu_percent} color="#8ab4f8" size={48} />
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--color-muted)' }}>CPU</div>
              <div className="text-[12px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>{stats.cpu_percent}%</div>
            </div>
            <div className="text-center">
              <RingProgress percent={stats.ram_percent} color="#a855f7" size={48} />
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--color-muted)' }}>RAM</div>
              <div className="text-[12px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>{stats.ram_percent}%</div>
            </div>
            <div className="text-center">
              <RingProgress percent={typeof diskPercent === 'number' ? diskPercent : 0} color="#00FF88" size={48} />
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--color-muted)' }}>Disco</div>
              <div className="text-[12px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                {typeof diskPercent === 'number' ? `${diskPercent}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Dispositivos (resumen) — derivamos serial/battery de /api/adb/devices si llega */}
        <DevicesCard deviceCount={deviceCount} />

        {/* Proxies (resumen) — latencia real de /api/proxies; '—' si no medida */}
        <ProxiesCard proxies={realProxies} />
      </div>

      {/* Fila 2.5 — Alertas accionables (TASK §9.4) */}
      <AlertsRow
        queue={queue}
        deviceCount={deviceCount}
        stack={stack}
        onOpenJob={(jobId) => onOpenPreview?.(queue.find((q) => q.id === jobId)!)}
        onApproveJob={onApproveJob}
        onRejectJob={onRejectJob}
        onRetryJob={onProcessNextJob}
      />

      {/* Fila 3: Cuentas | Cola | mini Calendario */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gridAutoRows: 'minmax(320px, auto)',
        }}
      >
        <section
          className="flex flex-col rounded-lg overflow-hidden border min-h-[320px]"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <div className="flex-1 overflow-hidden">
            <AccountsPanel
              accounts={accounts}
              proxies={proxies}
              onAddAccount={onAddAccount}
              onDeleteAccount={onDeleteAccount}
              onSelectAccountForDetail={onSelectAccountForDetail}
            />
          </div>
        </section>
        <section
          className="flex flex-col rounded-lg overflow-hidden border min-h-[320px]"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <div className="flex-1 overflow-hidden">
            <QueuePanel
              queue={queue}
              accounts={accounts}
              isProcessing={isProcessingJob}
              onAddJob={onAddJob}
              onProcessNextJob={onProcessNextJob}
              onOpenPreview={onOpenPreview}
              onApproveJob={onApproveJob}
              onPublishJob={onPublishJob}
              onMarkReady={onMarkReady}
              onRejectJob={onRejectJob}
              onDeleteJob={onDeleteJob}
            />
          </div>
        </section>
        <section
          className="flex flex-col rounded-lg overflow-hidden border min-h-[320px]"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <div className="flex-1 overflow-hidden">
            <ScheduleModal
              embedded
              hideForm
              queue={queue}
              accounts={accounts}
              onClose={() => { /* no-op */ }}
              onScheduleJob={onScheduleJob}
              onRescheduleJob={onRescheduleJob}
              onRefresh={refreshBackendData}
              onSelectScheduledJob={onSelectScheduledJob}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

/**
 * AlertsRow — TASK §9.4 alertas accionables.
 * Deriva alertas reales del estado de queue/devices/stack:
 *  - Jobs en `awaiting_approval` (revisión necesaria).
 *  - Jobs en `failed` o `awaiting_manual_upload` (acción manual).
 *  - 0 dispositivos online.
 *  - MPT offline.
 *  - Flask offline (derivado de stack.flask_online).
 *
 * Cada alerta expone acciones (Revisar/Reintentar/Silenciar) en función del
 * contexto real. Sin cifras inventadas.
 */
const AlertsRow: React.FC<{
  queue: QueueJob[];
  deviceCount: number;
  stack: StackInfo | null;
  onOpenJob?: (jobId: string) => void;
  onApproveJob?: (jobId: string) => void;
  onRejectJob?: (jobId: string) => void;
  onRetryJob?: () => void;
}> = ({ queue, deviceCount, stack, onOpenJob, onApproveJob, onRejectJob, onRetryJob }) => {
  const awaiting = queue.filter((j) => j.status === 'awaiting_approval');
  const failedJobs = queue.filter((j) => j.status === 'failed' || j.status === 'awaiting_manual_upload');
  const mptOffline = stack != null && stack.mpt_online === false;
  const noDevices = deviceCount === 0;

  const items: Array<{
    id: string;
    kind: 'warn' | 'danger' | 'info' | 'ok';
    title: string;
    detail: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: Array<{ label: string; onClick: () => void; tone?: 'primary' | 'secondary' | 'danger' }>;
  }> = [];

  if (awaiting.length > 0) {
    items.push({
      id: 'awaiting-approval',
      kind: 'warn',
      title: `${awaiting.length} job(s) esperando aprobación`,
      detail: 'Revisa el script y aprueba o rechaza antes de pasar a la fase de publicación.',
      severity: 'medium',
      actions: awaiting.slice(0, 3).flatMap((j) => [
        { label: `Revisar ${j.id}`, onClick: () => onOpenJob?.(j.id), tone: 'primary' as const },
        ...(onApproveJob ? [{ label: 'Aprobar', onClick: () => onApproveJob(j.id), tone: 'secondary' as const }] : []),
        ...(onRejectJob ? [{ label: 'Rechazar', onClick: () => onRejectJob(j.id), tone: 'danger' as const }] : []),
      ]),
    });
  }
  if (failedJobs.length > 0) {
    items.push({
      id: 'failed-jobs',
      kind: 'danger',
      title: `${failedJobs.length} job(s) en estado de fallo`,
      detail: 'Fallos recientes requieren inspección: ¿MPT timeout? ¿API key agotada? ¿Proxy bloqueado?',
      severity: 'high',
      actions: [
        ...(onRetryJob ? [{ label: 'Generar siguiente', onClick: () => onRetryJob(), tone: 'primary' as const }] : []),
        ...failedJobs.slice(0, 2).map((j) => ({ label: `Revisar ${j.id}`, onClick: () => onOpenJob?.(j.id), tone: 'secondary' as const })),
      ],
    });
  }
  if (mptOffline) {
    items.push({
      id: 'mpt-offline',
      kind: 'danger',
      title: 'MoneyPrinterTurbo no responde',
      detail: 'El adaptador no recibe /ping 2xx. Comprueba `platform/scripts/run-native.ps1` o `docker compose ps`.',
      severity: 'critical',
      actions: [
        { label: 'Refrescar', onClick: () => location.reload(), tone: 'secondary' as const },
      ],
    });
  }
  if (noDevices) {
    items.push({
      id: 'no-devices',
      kind: 'warn',
      title: 'Sin dispositivos ADB',
      detail: 'No hay `adb devices` activos. Conecta teléfonos o ejecuta `adb start-server`.',
      severity: 'medium',
      actions: [
        { label: 'Refrescar', onClick: () => location.reload(), tone: 'secondary' as const },
      ],
    });
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Alertas operacionales"
      className="rounded-lg border p-3 space-y-2"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] font-mono uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text)' }}>
          Alertas operacionales
        </h2>
        <StatusBadge kind="warn" label={`${items.length} activa(s)`} dot />
      </header>
      <div className="space-y-2">
        {items.map((it) => (
          <AlertRow
            key={it.id}
            kind={it.kind}
            title={it.title}
            detail={it.detail}
            severity={it.severity}
            actions={it.actions}
          />
        ))}
      </div>
    </section>
  );
};

/** Mini stat para grids internos. */
const MiniStat: React.FC<{ label: string; value: string; tone?: 'brand' | 'ok' | 'warn' | 'danger' }> = ({ label, value, tone = 'brand' }) => {
  const c = tone === 'ok' ? '#00FF88' : tone === 'warn' ? '#FFB800' : tone === 'danger' ? '#FF3B5C' : '#8ab4f8';
  return (
    <div className="text-center">
      <div className="text-[18px] font-bold font-mono" style={{ color: c }}>{value}</div>
      <div className="text-[10px] font-mono uppercase mt-0.5" style={{ color: 'var(--color-muted)' }}>{label}</div>
    </div>
  );
};

/**
 * Item reutilizable del sidebar. Soporta colapsado (icon-only) y expandido
 * (icon + label + badge opcional). Border-left brand color cuando está activo.
 */
const SidebarItem: React.FC<{
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
  title: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}> = ({ collapsed, active = false, onClick, title, label, icon, badge }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className="w-full px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2 text-[12px]"
    style={{
      borderColor: active ? 'var(--color-brand)' : 'transparent',
      background: active ? 'var(--color-surface-2)' : undefined,
      color: active ? 'var(--color-text)' : 'var(--color-muted)',
      justifyContent: collapsed ? 'center' : 'flex-start',
    }}
  >
    <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>
    {!collapsed && <span className="truncate">{label}</span>}
    {!collapsed && badge !== undefined && (
      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--color-surface-3)', color: 'var(--color-muted-2)' }}>{badge}</span>
    )}
  </button>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [stats, setStats] = useState<SystemStats>(EMPTY_STATS);
  const [deviceCount, setDeviceCount] = useState(0);

  // Stack real (procesos nativos + salud MPT/Flask) — ver /api/stack
  const [stack, setStack] = useState<StackInfo>({
    containers: [], native: [], mpt_online: false, flask_online: false, drafts: 0, mode: 'native'
  });

  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [showAdbModal, setShowAdbModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showPandaModal, setShowPandaModal] = useState(false);
  // Página principal: 'dashboard' = solo calendario visual (default),
  // 'cuentas' = lista de cuentas, 'cola' = cola de jobs, 'calendario' =
  // calendario completo con formulario de programación.
  const [mainView, setMainView] = useState<'dashboard' | 'cuentas' | 'cola' | 'calendario'>('dashboard');
  // Sidebar izquierdo colapsado (reducido a iconos). Default expandido.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Consola: false = colapsado (2 líneas), true = expandido (5 líneas).
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [showMoneyPrinterModal, setShowMoneyPrinterModal] = useState(false);
  const [showVersionControlModal, setShowVersionControlModal] = useState(false);

  // Modo claro/oscuro — persistido en localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('phonefarm-theme') || 'dark') as 'dark' | 'light'
  );
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('phonefarm-theme', next);
  };

  // Tab activo del header (resalta el modal abierto)
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const openTab = (tab: ActiveTab, open: () => void) => {
    setActiveTab(tab);
    open();
  };

  // Master ON/OFF eliminado en Fase A: ya no hay bots taktik que orquestar.
  // El master switch del Header sigue existiendo visualmente pero queda
  // inerte hasta que se decida qué representa en el modelo de rampas de
  // publicación (Fase D del plan TikTok/Instagram).

  // New interactive modals
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<Account | null>(null);
  const [activePreviewDraft, setActivePreviewDraft] = useState<DraftPost | null>(null);
  // Cuenta preseleccionada al abrir MoneyPrinter desde AccountDetail (o null = accounts[0])
  const [moneyPrinterAccount, setMoneyPrinterAccount] = useState<Account | null>(null);

  // Verify auth status on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch (err) {
        // Backend no responde: NUNCA autenticar con credenciales locales — el panel muestra login.
        setCurrentUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    // FE-11: limpiar TODOS los estados de datos/logs para no filtrar la
    // operación de la sesión anterior en la pantalla de login.
    setCurrentUser(null);
    setStats(EMPTY_STATS);
    setAccounts([]);
    setProxies([]);
    setQueue([]);
    setLogs([]);
    setDeviceCount(0);
  };

  // FE-03: si cualquier fetch de refresco devuelve 401/403, la sesión expiró:
  // limpiar sesión y volver al login (antes los errores se descartaban en
  // silencio y el panel seguía mostrando datos obsoletos como frescos).
  const refreshBackendData = async () => {
    if (!currentUser) return;
    const guard = (r: Response) => {
      if (r.status === 401 || r.status === 403) {
        setCurrentUser(null);
        return null;
      }
      return r.ok ? r.json() : null;
    };
    // allSettled: un endpoint lento (p.ej. verify de proxy online) NO debe
    // bloquear el render de los demás (antes Promise.all los congelaba).
    const [statsRes, accountsRes, proxiesRes, queueRes, devicesRes] = await Promise.allSettled([
      apiFetch('/api/stats').then(guard),
      apiFetch('/api/accounts').then(guard),
      apiFetch('/api/proxies').then(guard),
      apiFetch('/api/queue').then(guard),
      apiFetch('/api/adb/devices').then(guard)
    ]);
    const val = <T,>(p: PromiseSettledResult<T | null>): T | null =>
      p.status === 'fulfilled' ? p.value : null;

    const stats = val(statsRes);
    const accounts = val(accountsRes);
    const proxies = val(proxiesRes);
    const queue = val(queueRes);
    const devices = val<{ devices?: { serial: string }[] }>(devicesRes);
    if (stats) setStats(stats);
    if (accounts) setAccounts(accounts);
    if (proxies) setProxies(proxies);
    if (queue) setQueue(queue);
    // Contador REAL de terminales conectados por ADB (no cuentas configuradas).
    if (devices?.devices) setDeviceCount(devices.devices.filter(d => d.serial).length);
  };

  useEffect(() => {
    if (!currentUser) return;
    refreshBackendData();
    const interval = setInterval(refreshBackendData, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Estado del stack Docker (contenedores, MPT, Flask) — 5 s
  useEffect(() => {
    if (!currentUser) return;
    const fetchStack = async () => {
      try {
        const res = await apiFetch('/api/stack', { signal: AbortSignal.timeout(8000) });
        if (res.ok) setStack(await res.json());
      } catch (e) { /* stack no disponible */ }
    };
    fetchStack();
    const interval = setInterval(fetchStack, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Subscribe to real-time SSE logs from server.
  // FE-04: (a) el stream SOLO se abre con sesión (antes corría pre-login);
  // (b) se re-crea al iniciar sesión (deps [currentUser]); (c) onerror/onopen
  // derivan el estado real de conectividad; (d) se cierra en logout.
  const [sseConnected, setSseConnected] = useState(false);
  useEffect(() => {
    if (!currentUser) return;
    let closed = false;
    try {
      const sse = new EventSource('/api/stream/logs');
      sse.onopen = () => { if (!closed) setSseConnected(true); };
      sse.onerror = () => { if (!closed) setSseConnected(false); };
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.message) {
            setLogs(prev => [...prev.slice(-100), {
              id: Math.random().toString(),
              timestamp: new Date().toLocaleTimeString(),
              level: data.level || 'INFO',
              module: data.module || 'System',
              message: data.message
            }]);
          }
        } catch (e) {
          // parse string
        }
      };
      return () => { closed = true; setSseConnected(false); sse.close(); };
    } catch (e) {
      // sse fallback
      return undefined;
    }
  }, [currentUser]);

  // Account Operations
  // handleToggleBot ELIMINADO en Fase A: no hay bots de engagement. El botón
  // "Toggle bot" en AccountsPanel queda visualmente pero sin efecto hasta
  // que se decida qué acción representa en el modelo de rampas (Fase D).

  const handleAddAccount = async (newAcc: Partial<Account>) => {
    try {
      const res = await apiFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAcc)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'PlatformServer', `Alta de cuenta rechazada: ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'PlatformServer', `Nueva cuenta creada: ${data?.id || ''}`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'PlatformServer', `No se pudo crear la cuenta: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      const res = await apiFetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'PlatformServer', `Borrado rechazado (${accountId}): ${data?.error || res.status}`);
        return;
      }
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'PlatformServer', `No se pudo eliminar ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Queue Operations
  const handleAddJob = async (keyword: string, targetAccount: string) => {
    try {
      const res = await apiFetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, target_account: targetAccount })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Generator', `Job rechazado: ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'Generator', `Job ${data?.id || ''} encolado (keyword '${keyword}')`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Generator', `No se pudo encolar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Programar publicación futura desde el calendario (scheduled_time ISO -> scheduler real)
  const handleScheduleJob = async (keyword: string, targetAccount: string, scheduledTime: string) => {
    const res = await apiFetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, target_account: targetAccount, scheduled_time: scheduledTime })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    addLog('INFO', 'Scheduler', `Job ${data?.id || ''} PROGRAMADO para ${scheduledTime} (${keyword})`);
    refreshBackendData();
  };

  // Re-programar job existente (drag&drop del calendario)
  const handleRescheduleJob = async (jobId: string, scheduledTime: string) => {
    const res = await apiFetch(`/api/queue/${jobId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_time: scheduledTime })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    addLog('INFO', 'Scheduler', `${jobId} re-programado para ${scheduledTime}`);
    refreshBackendData();
  };

  const handleProcessNextJob = async () => {
    setIsProcessingJob(true);
    try {
      const res = await apiFetch('/api/queue/next', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addLog('INFO', 'Generator', `Pipeline iniciado para ${data?.id || 'job'} (processing)`);
        await refreshBackendData();
      } else {
        // FE-06: el WARN de cola vacía/error estaba DENTRO del if(res.ok)
        // (indentación engañosa) — nunca se logueaba el fallo.
        addLog('WARN', 'Generator', data?.message || data?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      addLog('ERROR', 'Generator', `queue/next falló: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessingJob(false);
    }
  };

  const handleApproveJob = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/queue/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Queue', `Aprobación rechazada (${jobId}): ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'Queue', `Job ${jobId} guiado a generate (approve)`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Queue', `approve falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRejectJob = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/queue/${jobId}/reject`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Queue', `Reject rechazado (${jobId}): ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'Queue', `Job ${jobId} rechazado (rejected)`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Queue', `reject falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/queue/${jobId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('WARN', 'Queue', `Borrar ${jobId}: ${data?.error || 'Flask no implementa DELETE /api/queue/:id'}`);
        return;
      }
      addLog('INFO', 'Queue', `Job ${jobId} eliminado`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Queue', `delete falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Marcar vídeo como "listo para publicar" (operator; lo publica un admin)
  const handleMarkReady = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/queue/${jobId}/ready`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Queue', `Marcar listo rechazado (${jobId}): ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'Queue', `Job ${jobId} marcado listo para publicar`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Queue', `ready falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Aprobar PUBLICACIÓN del vídeo ya generado (ready_for_publish -> publishing)
  // Con confirmación explícita + versión esperada (concurrencia optimista).
  const handlePublishJob = async (jobId: string, version: number) => {
    try {
      const res = await apiFetch(`/api/queue/${jobId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, expected_version: version })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Queue', `Publicación rechazada (${jobId}): ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'Queue', `Job ${jobId} publicación aprobada (publishing)`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Queue', `publish falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Proxy Operations
  const handleAddProxy = async (newProxy: Partial<ProxyItem>) => {
    try {
      const res = await apiFetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProxy)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'ProxyManager', `Proxy rechazado: ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'ProxyManager', `Proxy ${data?.id || ''} registrado`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'ProxyManager', `No se pudo registrar el proxy: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleVerifyProxy = async (proxyId: string) => {
    try {
      const res = await apiFetch('/api/proxies/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_id: proxyId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'ProxyManager', `Verificación rechazada (${proxyId}): ${data?.error || res.status}`);
        return;
      }
      addLog('INFO', 'ProxyManager', `Proxy ${proxyId}: ${data?.status || '?'} ${data?.ip ? `(${data.ip}, ${data.latency_ms}ms)` : ''}`);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'ProxyManager', `No se pudo verificar ${proxyId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Helper Logger
  const addLog = (level: LogEntry['level'], module: string, message: string) => {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      module,
      message
    };
    setLogs(prev => [...prev, entry]);
  };

  // Download single file
  const handleDownloadFile = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Download complete .ZIP package — servidor real (ZIP del estado en Flask)
  const handleDownloadAllZip = async () => {
    window.location.href = '/api/download-zip';
  };

  // REST API Tester (real): ejecuta el endpoint y dispara refresco; error claro si falla
  const handleRunEndpointTest = async (method: string, endpoint: string, body?: any) => {
    addLog('INFO', 'PlatformServer', `Exec: ${method} ${endpoint}`);
    try {
      const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) options.body = JSON.stringify(body);
      const res = await apiFetch(endpoint, options);
      const data = await res.json().catch(() => ({}));
      if (res.ok) refreshBackendData();
      return data;
    } catch (err) {
      return { error: `Fetch falló (${endpoint}): ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const handleOpenPreviewForJob = async (job: QueueJob) => {
    const acc = accounts.find(a => a.id === job.target_account) || accounts[0];
    let scriptTxt = job.script || '';
    let captionTxt = job.caption || '';
    // El vídeo REAL está disponible si el job lo tiene (awaiting_preview o publicado)
    const jobHasVideo = Boolean(job.video_path) && (job.status === 'awaiting_preview' || job.status === 'published' || job.status === 'awaiting_manual_upload');
    if (!scriptTxt && !jobHasVideo) {
      // No hay draft todavía; pedir a MPT un guión real (preview sin encolar)
      try {
        const res = await apiFetch('/api/content/preview', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({keyword: job.keyword, niche_id: 'general'})
        });
        if (res.ok) {
          const data = await res.json();
          scriptTxt = data.script || '';
          captionTxt = data.caption || '';
        }
      } catch (err) { /* noop */ }
    }
    // video_path es ruta local (C:\...\videos\job_X.mp4) -> URL servible por
    // Express /videos/<file> (proxy a Flask), para el <video> del modal.
    const videoUrl = jobHasVideo && job.video_path
      ? `/videos/${job.video_path.split(/[\\/]/).pop()}`
      : undefined;
    const draft: DraftPost = {
      id: `draft_${job.id}`, job_id: job.id, title: job.keyword, keyword: job.keyword,
      target_account_id: acc.id, target_account_username: acc.username,
      platform: 'instagram',
      video_url: videoUrl,
      script: scriptTxt || '(genera guión con MiniMax en el paso anterior)',
      caption: captionTxt || job.script || job.keyword,
      hashtags: ['#reels','#viral','#fyp'],
      status: job.status === 'published' ? 'published' : 'draft',
      created_at: job.created_at, aspect_ratio: '9:16', voice_tts: 'es-ES-AlvaroNeural',
    };
    setActivePreviewDraft(draft);
  };

  const handleApproveAndPublishDraft = async (draftId: string, updatedCaption: string, platform: 'instagram' | 'tiktok' | 'both') => {
    if (!activePreviewDraft) return;
    const jobId = activePreviewDraft.job_id;
    try {
      const res = await apiFetch(`/api/queue/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: updatedCaption, platform })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Publisher', `Aprobación rechazada (${jobId}): ${data?.error || res.status}`);
      } else {
        addLog('INFO', 'Publisher', `Draft ${jobId} aprobado -> generación+publicación iniciada (${platform.toUpperCase()})`);
      }
      setActivePreviewDraft(null);
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Publisher', `approve falló: ${err instanceof Error ? err.message : String(err)}`);
      setActivePreviewDraft(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#17181A] text-[#8A8F98] font-mono flex items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-[#8A8F98] animate-ping" />
          <span className="text-xs uppercase tracking-widest text-[#9CA1A8]">Cargando TH3F4Rm3R Phone Farm System...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans ${theme === 'dark' ? 'theme-dark bg-[#17181A] text-[#E5E5E5]' : 'theme-light bg-[#F8FAFC] text-[#1E293B]'}`}>
      {/* Barra superior — texto plano */}
      <Header
        stats={stats}
        accounts={accounts}
        proxies={proxies}
        currentUser={currentUser}
        deviceCount={deviceCount}
        onOpenPandaGrid={() => window.open('/panda', '_blank', 'noopener,width=1100,height=760')}
        onOpenMoneyPrinter={() => openTab('moneyprinter', () => setShowMoneyPrinterModal(true))}
        onOpenAdbBridge={() => openTab('adb', () => setShowAdbModal(true))}
        onOpenCurlTester={() => openTab('curl', () => setShowCurlModal(true))}
        onOpenCodeViewer={() => openTab('code', () => setShowCodeModal(true))}
        onOpenVersionControl={() => openTab('versions', () => setShowVersionControlModal(true))}
        onDownloadAllZip={() => { window.location.href = '/api/download-zip'; }}
        onToggleMaster={() => { /* Fase A: master ON/OFF inerte. */ }}
        onLogout={handleLogout}
      />

      {/* Stack: procesos nativos + salud MPT/Flask — texto plano */}
      <div
        className="flex items-center gap-4 px-4 py-1 border-b text-[11px] font-mono overflow-x-auto whitespace-nowrap"
        style={{ background: 'var(--color-stack-bg)', borderColor: 'var(--color-stack-border)' }}
      >
        <span className="font-bold tracking-wider text-[#9CA1A8]">STACK NATIVO</span>
        {stack.native?.length ? stack.native.map((p) => (
          <span key={p} className="text-[#6B7076]">
            {p.includes('phonefarm.platform') ? 'platform' : 'moneyprinter'} · nativo
          </span>
        )) : (
          <span className="text-[#E05B5B]">procesos nativos no detectados</span>
        )}
        <span className={`ml-auto ${stack.mpt_online ? 'text-[#6FBF73]' : 'text-[#E05B5B]'}`}>
          MPT {stack.mpt_online ? 'online' : 'offline'}
        </span>
        <span className={stack.flask_online ? 'text-[#6FBF73]' : 'text-[#E05B5B]'}>
          Flask {stack.flask_online ? 'online' : 'offline'}
        </span>
        <span className="text-[#6B7076]">drafts: {stack.drafts}</span>
      </div>

      {/* Layout principal: sidebar dock + contenido con tabs */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar dock — colapsado (56px iconos) / expandido (200px). Toggle con flecha abajo. */}
        <aside
          className={`${sidebarCollapsed ? 'w-14' : 'w-52'} shrink-0 border-r flex flex-col font-mono text-[12px] overflow-hidden transition-all duration-200`}
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        >
          {/* Status footer (siempre visible) */}
          <div className="px-3 py-3 border-b text-[10px] tabular-nums flex items-center justify-between" style={{ borderColor: 'var(--color-line)', color: 'var(--color-muted-2)' }}>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: stack.flask_online ? 'var(--color-ok)' : 'var(--color-danger)' }}
              />
              {!sidebarCollapsed && <span>cpu {stats.cpu_percent}%</span>}
            </span>
          </div>

          {/* Navegación principal: Dashboard, Cuentas, Cola, Calendario */}
          <nav className="flex-1 py-2">
            <SidebarItem
              collapsed={sidebarCollapsed}
              active={mainView === 'dashboard'}
              onClick={() => setMainView('dashboard')}
              title="Dashboard"
              label="Dashboard"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
              }
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              active={mainView === 'cuentas'}
              onClick={() => setMainView('cuentas')}
              title="Cuentas"
              label="Cuentas"
              badge={accounts.length}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              }
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              active={mainView === 'cola'}
              onClick={() => setMainView('cola')}
              title="Cola"
              label="Cola"
              badge={queue.length}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              }
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              active={mainView === 'calendario'}
              onClick={() => setMainView('calendario')}
              title="Calendario"
              label="Calendario"
              badge={queue.filter(j => j.scheduled_ts).length}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              }
            />
          </nav>

          {/* Separador + items secundarios (modales del header original) */}
          <div className="border-t py-1" style={{ borderColor: 'var(--color-line)' }}>
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('moneyprinter', () => setShowMoneyPrinterModal(true))}
              title="MoneyPrinter"
              label="MoneyPrinter"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('adb', () => setShowAdbModal(true))}
              title="ADB Bridge"
              label="ADB Bridge"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('panda', () => setShowPandaModal(true))}
              title="Panda live"
              label="Panda live"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>}
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('proxies', () => setShowProxyModal(true))}
              title="Proxies"
              label="Proxies"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
            />
          </div>

          {/* Dev group — separador visible + etiqueta (TASK §8.1). */}
          {!sidebarCollapsed && (
            <div
              className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border-t"
              style={{ color: 'var(--color-muted-2)', borderColor: 'var(--color-line)' }}
              aria-label="Sección dev"
            >
              Dev
            </div>
          )}
          <div className="py-1">
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('curl', () => setShowCurlModal(true))}
              title="cURL API"
              label="cURL API"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>}
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('code', () => setShowCodeModal(true))}
              title="Código Python"
              label="Código Python"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
            />
            <SidebarItem
              collapsed={sidebarCollapsed}
              onClick={() => openTab('versions', () => setShowVersionControlModal(true))}
              title="Versiones"
              label="Versiones"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            />
          </div>

          {/* Toggle colapsar/expandir (flecha discreta abajo) */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
            className="px-3 py-2.5 flex items-center gap-2 transition-colors border-t text-[10px] uppercase tracking-wider"
            style={{ borderColor: 'var(--color-line)', color: 'var(--color-muted)' }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
              </svg>
            </span>
            {!sidebarCollapsed && <span>{sidebarCollapsed ? 'Expandir' : 'Colapsar'}</span>}
          </button>

          </aside>

        {/* Main — vista seleccionada por mainView */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Encabezado de página */}
          <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
            <h1 className="text-[13px] font-mono uppercase tracking-wider font-bold" style={{ color: 'var(--color-text)' }}>
              {mainView === 'dashboard' && 'Dashboard'}
              {mainView === 'cuentas' && 'Cuentas'}
              {mainView === 'cola' && 'Cola'}
              {mainView === 'calendario' && 'Calendario'}
            </h1>
            {mainView === 'dashboard' && (
              <span className="text-[11px]" style={{ color: 'var(--color-muted-2)' }}>
                Resumen general de tu Phone Farm
              </span>
            )}
          </div>

          {/*
            * Cuerpo:
            *  - 'dashboard'   → stat cards (5 top + 4 bottom) + 3 columnas
            *  - 'cuentas'     → solo AccountsPanel
            *  - 'cola'        → solo QueuePanel
            *  - 'calendario'  → calendario editor completo
            */}
          <div className="flex-1 overflow-auto">
            {mainView === 'dashboard' && (
              <DashboardView
                accounts={accounts}
                queue={queue}
                proxies={proxies}
                stats={stats}
                deviceCount={deviceCount}
                stack={stack}
                onAddAccount={handleAddAccount}
                onDeleteAccount={handleDeleteAccount}
                onSelectAccountForDetail={(acc) => setSelectedAccountForDetail(acc)}
                onAddJob={handleAddJob}
                onProcessNextJob={handleProcessNextJob}
                onOpenPreview={handleOpenPreviewForJob}
                onApproveJob={handleApproveJob}
                onPublishJob={handlePublishJob}
                onMarkReady={handleMarkReady}
                onRejectJob={handleRejectJob}
                onDeleteJob={handleDeleteJob}
                isProcessingJob={isProcessingJob}
                onScheduleJob={handleScheduleJob}
                onRescheduleJob={handleRescheduleJob}
                refreshBackendData={refreshBackendData}
                onSelectScheduledJob={() => setMainView('calendario')}
              />
            )}

            {mainView === 'cuentas' && (
              <div className="h-full p-3">
                <AccountsPanel
                  accounts={accounts}
                  proxies={proxies}
                  onAddAccount={handleAddAccount}
                  onDeleteAccount={handleDeleteAccount}
                  onSelectAccountForDetail={(acc) => setSelectedAccountForDetail(acc)}
                />
              </div>
            )}

            {mainView === 'cola' && (
              <div className="h-full p-3">
                <QueuePanel
                  queue={queue}
                  accounts={accounts}
                  isProcessing={isProcessingJob}
                  onAddJob={handleAddJob}
                  onProcessNextJob={handleProcessNextJob}
                  onOpenPreview={handleOpenPreviewForJob}
                  onApproveJob={handleApproveJob}
                  onPublishJob={handlePublishJob}
                  onMarkReady={handleMarkReady}
                  onRejectJob={handleRejectJob}
                  onDeleteJob={handleDeleteJob}
                />
              </div>
            )}

            {mainView === 'calendario' && (
              <div className="h-full p-3">
                <div className="h-full flex flex-col rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-line)' }}>
                  <ScheduleModal
                    embedded
                    queue={queue}
                    accounts={accounts}
                    onClose={() => { /* no-op en modo embebido */ }}
                    onScheduleJob={handleScheduleJob}
                    onRescheduleJob={handleRescheduleJob}
                    onRefresh={refreshBackendData}
                  />
                </div>
              </div>
            )}
          </div>

          {/*
            * Terminal Logs — fixed al fondo, colapsable con flecha discreta.
            *  - Expandido: altura 130px, muestra los últimos 5 logs (slice(-5))
            *  - Colapsado: altura 60px, muestra los últimos 2 logs (slice(-2))
            * Toggle con flecha arriba/abajo en la cabecera del bloque.
            */}
          <div
            className="shrink-0 overflow-hidden border-t"
            style={{
              height: terminalExpanded ? 130 : 60,
              transition: 'height 220ms ease',
              borderColor: 'var(--color-line)',
            }}
          >
            <div className="flex flex-col h-full" style={{ background: 'var(--color-surface)' }}>
              {/* Cabecera del bloque consola con flecha toggle */}
              <div
                className="px-3 py-1.5 flex items-center justify-between border-b shrink-0"
                style={{ borderColor: 'var(--color-line)' }}
              >
                <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wide" style={{ color: 'var(--color-muted-2)' }}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ background: sseConnected ? 'var(--color-ok)' : 'var(--color-muted)' }}
                    />
                    Consola {sseConnected ? '· SSE conectado' : '· SSE desconectado'}
                  </span>
                  <button
                    onClick={() => setLogs([])}
                    className="px-1.5 py-0.5 rounded text-[10px] uppercase hover:opacity-80"
                    style={{ background: 'var(--color-surface-3)', color: 'var(--color-muted)' }}
                  >
                    Limpiar
                  </button>
                </div>
                <button
                  onClick={() => setTerminalExpanded(!terminalExpanded)}
                  title={terminalExpanded ? 'Colapsar consola' : 'Expandir consola'}
                  aria-label={terminalExpanded ? 'Colapsar consola' : 'Expandir consola'}
                  className="px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
                  style={{ background: 'var(--color-surface-3)', color: 'var(--color-muted)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {terminalExpanded ? <polyline points="6 9 12 15 18 9" /> : <polyline points="6 15 12 9 18 15" />}
                  </svg>
                </button>
              </div>
              {/* Cuerpo: 5 líneas expandido / 2 colapsado */}
              <div className="flex-1 overflow-hidden">
                <TerminalLogs
                  logs={terminalExpanded ? logs.slice(-5) : logs.slice(-2)}
                  onClearLogs={() => setLogs([])}
                  sseConnected={sseConnected}
                />
              </div>
            </div>
          </div>
        </main>

      {/* Modals */}
      <AnimatePresence>
        {showProxyModal && (
          <ProxyModal
            key="proxy-modal"
            isOpen={showProxyModal}
            proxies={proxies}
            onClose={() => setShowProxyModal(false)}
            onAddProxy={handleAddProxy}
            onVerifyProxy={handleVerifyProxy}
          />
        )}
      </AnimatePresence>

      {showCodeModal && (
        <CodeViewerModal
          isOpen={showCodeModal}
          onClose={() => setShowCodeModal(false)}
          onDownloadFile={handleDownloadFile}
        />
      )}

      {showCurlModal && (
        <CurlTesterModal
          isOpen={showCurlModal}
          onClose={() => setShowCurlModal(false)}
          onRunEndpointTest={handleRunEndpointTest}
        />
      )}

      {showAdbModal && (
        <AdbBridgeModal
          onClose={() => setShowAdbModal(false)}
          onRefreshData={refreshBackendData}
        />
      )}

      {showPandaModal && (
        <PandaGridModal
          onClose={() => setShowPandaModal(false)}
        />
      )}

      <AnimatePresence>
        {showMoneyPrinterModal && (
          <MoneyPrinterModal
            key="moneyprinter-modal"
            accounts={accounts}
            initialAccount={moneyPrinterAccount || undefined}
            onClose={() => { setShowMoneyPrinterModal(false); setMoneyPrinterAccount(null); }}
            onRefreshData={refreshBackendData}
          />
        )}
      </AnimatePresence>

      {/* Account Data & Analytics Consultation Modal */}
      <AnimatePresence>
        {selectedAccountForDetail && (
          <AccountDetailModal
            key="account-detail-modal"
            account={selectedAccountForDetail}
            proxies={proxies}
            queue={queue}
            onClose={() => setSelectedAccountForDetail(null)}
            onOpenMoneyPrinterForAccount={(acc) => {
              setMoneyPrinterAccount(acc);
              setSelectedAccountForDetail(null);
              setShowMoneyPrinterModal(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* Video Preview Modal (Instagram Reels & TikTok 9:16) */}
      {activePreviewDraft && (
        <PostPreviewModal
          draft={activePreviewDraft}
          accounts={accounts}
          onClose={() => setActivePreviewDraft(null)}
          onApproveAndPublish={handleApproveAndPublishDraft}
        />
      )}

      {/* Version Control & Backup History Modal */}
      {showVersionControlModal && (
        <VersionControlModal
          accounts={accounts}
          proxies={proxies}
          queue={queue}
          onClose={() => setShowVersionControlModal(false)}
          onDownloadZip={handleDownloadAllZip}
        />
      )}
      </div>
    </div>
  );
}
