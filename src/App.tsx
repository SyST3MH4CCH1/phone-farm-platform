import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Account, ProxyItem, QueueJob, LogEntry, SystemStats, AuthUser, StackInfo, DraftPost } from './types';
import { Header, ActiveTab } from './components/Header';
import { AccountsPanel } from './components/AccountsPanel';
import { QueuePanel } from './components/QueuePanel';
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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showMoneyPrinterModal, setShowMoneyPrinterModal] = useState(false);
  const [showVersionControlModal, setShowVersionControlModal] = useState(false);
  const [terminalMinimized, setTerminalMinimized] = useState(false);

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

  // Master ON/OFF — real: arranca/detiene los bots taktik de las cuentas
  // (engagement exige account_id por cuenta; el switch actúa sobre todas).
  // Lee el estado FRESCO de /api/stats antes de decidir (el estado del
  // componente puede ir con 5s de retraso y decidir al revés).
  const handleToggleMaster = async () => {
    let turningOn = (stats.active_bots || 0) === 0;
    try {
      const fresh = await apiFetch('/api/stats').then(r => r.ok ? r.json() : null);
      if (fresh) turningOn = (fresh.active_bots || 0) === 0;
    } catch { /* usar estado local */ }
    const targetAccounts = accounts.filter(a => turningOn ? !a.bot_active : a.bot_active);
    if (targetAccounts.length === 0) {
      addLog('INFO', 'Master', turningOn ? 'Todos los bots ya están activos' : 'No hay bots activos que detener');
      return;
    }
    let ok = 0, fail = 0;
    for (const acc of targetAccounts) {
      try {
        const res = await apiFetch(turningOn ? '/engagement/start' : '/engagement/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: acc.id })
        });
        if (res.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    addLog('INFO', 'Master', `Master ${turningOn ? 'ON' : 'OFF'}: ${ok} bot(s) ${turningOn ? 'iniciado(s)' : 'detenido(s)'}${fail ? `, ${fail} con error` : ''}`);
    refreshBackendData();
  };

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
  const handleToggleBot = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const endpoint = acc.bot_active ? '/engagement/stop' : '/engagement/start';
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog('ERROR', 'Engagement', `No se pudo cambiar el bot de @${acc.username}: ${data?.error || res.status}`);
        return;
      }
      refreshBackendData();
    } catch (err) {
      addLog('ERROR', 'Engagement', `Engagement no disponible para @${acc.username}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
        onToggleMaster={handleToggleMaster}
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
        {/* Sidebar dock — 56px icono-only, expander a 200px on hover */}
        <aside
          className="w-14 hover:w-52 shrink-0 border-r flex flex-col font-mono text-[12px] overflow-hidden transition-all duration-200 group"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        >
          {/* Status footer */}
          <div className="px-3 py-3 border-b text-[10px] tabular-nums" style={{ borderColor: 'var(--color-line)', color: 'var(--color-muted-2)' }}>
            <span className="hidden group-hover:inline">cpu {stats.cpu_percent}%</span>
            <span
              className="w-2 h-2 rounded-full inline-block ml-1"
              style={{
                background: stack.flask_online ? 'var(--color-ok)' : 'var(--color-danger)',
              }}
            />
          </div>

          {/* Nav items — icon + label on hover */}
          <button
            onClick={() => openTab('panda', () => setShowPandaModal(true))}
            title="Dispositivos ADB"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'panda' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'panda' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'panda' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Dispositivos</span>
            <span className="hidden group-hover:block ml-auto text-[10px]" style={{ color: 'var(--color-muted-2)' }}>{deviceCount}</span>
          </button>

          <button
            onClick={() => window.open('/panda', '_blank', 'noopener,width=1100,height=760')}
            title="Panda live"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors"
            style={{ color: 'var(--color-muted)' }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Panda live</span>
          </button>

          <button
            onClick={() => openTab('proxies', () => setShowProxyModal(true))}
            title="Proxies"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'proxies' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'proxies' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'proxies' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Proxies</span>
            <span className="hidden group-hover:block ml-auto text-[10px]" style={{ color: 'var(--color-muted-2)' }}>{proxies.length}</span>
          </button>

          <button
            onClick={() => openTab('schedule', () => setShowScheduleModal(true))}
            title="Calendario"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'schedule' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'schedule' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'schedule' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Calendario</span>
            <span className="hidden group-hover:block ml-auto text-[10px]" style={{ color: 'var(--color-muted-2)' }}>{queue.filter(j => j.scheduled_ts).length}</span>
          </button>

          <button
            onClick={() => openTab('moneyprinter', () => setShowMoneyPrinterModal(true))}
            title="MoneyPrinter"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'moneyprinter' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'moneyprinter' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'moneyprinter' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">MoneyPrinter</span>
          </button>

          <button
            onClick={() => openTab('adb', () => setShowAdbModal(true))}
            title="ADB Bridge"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'adb' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'adb' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'adb' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">ADB Bridge</span>
          </button>

          <button
            onClick={() => openTab('curl', () => setShowCurlModal(true))}
            title="cURL API"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'curl' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'curl' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'curl' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">cURL API</span>
          </button>

          <button
            onClick={() => openTab('code', () => setShowCodeModal(true))}
            title="Código Python"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'code' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'code' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'code' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Código Python</span>
          </button>

          <button
            onClick={() => openTab('versions', () => setShowVersionControlModal(true))}
            title="Versiones"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{
              borderColor: activeTab === 'versions' ? 'var(--color-brand)' : 'transparent',
              background: activeTab === 'versions' ? 'var(--color-surface-2)' : undefined,
              color: activeTab === 'versions' ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Versiones</span>
          </button>

          <button
            onClick={handleDownloadAllZip}
            title="Descargar ZIP"
            className="px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2"
            style={{ borderColor: 'transparent', color: 'var(--color-muted)' }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </span>
            <span className="hidden group-hover:block text-[11px]">Descargar ZIP</span>
          </button>
        </aside>

        {/* Main — tabs layout: Cuentas | Cola | Calendario */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b px-3 pt-2 gap-0.5 text-[11px] font-mono" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
            <button
              onClick={() => {}}
              className="px-4 py-2 rounded-t-md border-b-2 transition-colors"
              style={{ borderColor: 'var(--color-brand)', color: 'var(--color-text)', background: 'var(--color-surface-2)' }}
            >
              Cuentas <span className="ml-1 text-[10px]" style={{ color: 'var(--color-muted)' }}>{accounts.length}</span>
            </button>
            <button
              onClick={() => {}}
              className="px-4 py-2 rounded-t-md border-b-2 transition-colors"
              style={{ borderColor: 'transparent', color: 'var(--color-muted)' }}
            >
              Cola <span className="ml-1 text-[10px]" style={{ color: 'var(--color-muted-2)' }}>{queue.length}</span>
            </button>
            <button
              onClick={() => openTab('schedule', () => setShowScheduleModal(true))}
              className="px-4 py-2 rounded-t-md border-b-2 transition-colors"
              style={{ borderColor: 'transparent', color: 'var(--color-muted)' }}
            >
              Calendario
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 flex overflow-hidden p-3 gap-3">
            {/* Accounts Panel */}
            <div className="flex-1 overflow-hidden">
              <AccountsPanel
                accounts={accounts}
                proxies={proxies}
                onToggleBot={handleToggleBot}
                onAddAccount={handleAddAccount}
                onDeleteAccount={handleDeleteAccount}
                onSelectAccountForDetail={(acc) => setSelectedAccountForDetail(acc)}
              />
            </div>

            {/* Queue Panel */}
            <div className="flex-1 overflow-hidden">
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
          </div>

          {/* Terminal Logs — fixed at bottom */}
          <div className={`shrink-0 overflow-hidden ${terminalMinimized ? 'h-10' : 'h-48'}`} style={{ transition: 'height 200ms ease' }}>
            <TerminalLogs
              logs={logs}
              onClearLogs={() => setLogs([])}
              isMinimized={terminalMinimized}
              onToggleMinimize={() => setTerminalMinimized(!terminalMinimized)}
              sseConnected={sseConnected}
            />
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

      {showScheduleModal && (
        <ScheduleModal
          queue={queue}
          accounts={accounts}
          onClose={() => setShowScheduleModal(false)}
          onScheduleJob={handleScheduleJob}
          onRescheduleJob={handleRescheduleJob}
          onRefresh={refreshBackendData}
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
            onToggleBot={handleToggleBot}
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
