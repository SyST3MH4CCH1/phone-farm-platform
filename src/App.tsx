import React, { useState, useEffect } from 'react';
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
        theme={theme}
        deviceCount={deviceCount}
        onOpenPandaGrid={() => window.open('/panda', '_blank', 'noopener,width=1100,height=760')}
        onOpenMoneyPrinter={() => openTab('moneyprinter', () => setShowMoneyPrinterModal(true))}
        onOpenAdbBridge={() => openTab('adb', () => setShowAdbModal(true))}
        onOpenCurlTester={() => openTab('curl', () => setShowCurlModal(true))}
        onOpenCodeViewer={() => openTab('code', () => setShowCodeModal(true))}
        onOpenVersionControl={() => openTab('versions', () => setShowVersionControlModal(true))}
        onDownloadAllZip={() => { window.location.href = '/api/download-zip'; }}
        onToggleMaster={handleToggleMaster}
        onToggleTheme={toggleTheme}
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

      {/* Layout principal: sidebar + contenido */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — texto plano con contadores reales */}
        <aside
          className="w-48 shrink-0 border-r flex flex-col font-mono text-[12px] overflow-y-auto"
          style={{ background: 'var(--color-sidebar-bg)', borderColor: 'var(--color-sidebar-border)' }}
        >
          <div className="px-4 py-2 border-b text-[10px] uppercase tracking-wider" style={{ borderColor: 'var(--color-sidebar-border)', color: 'var(--color-header-muted2)' }}>Secciones</div>
          <button onClick={() => openTab('panda', () => setShowPandaModal(true))} title="Dispositivos ADB + manejo scrcpy" className={`px-4 py-2 text-left flex justify-between transition-colors ${activeTab === 'panda' ? 'font-bold' : ''}`} style={{ background: activeTab === 'panda' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'panda' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            <span>Dispositivos</span><span style={{ color: 'var(--color-header-muted2)' }}>{deviceCount}</span>
          </button>
          <button onClick={() => window.open('/panda', '_blank', 'noopener,width=1100,height=760')} title="Abrir Panda live (grid de pantallas) en ventana nueva" className="px-4 py-2 text-left flex justify-between transition-colors" style={{ color: 'var(--color-sidebar-text)' }}>
            <span>Panda live</span><span style={{ color: 'var(--color-header-muted2)' }}>↗</span>
          </button>
          <button onClick={() => openTab('proxies', () => setShowProxyModal(true))} className={`px-4 py-2 text-left flex justify-between transition-colors ${activeTab === 'proxies' ? 'font-bold' : ''}`} style={{ background: activeTab === 'proxies' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'proxies' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            <span>Proxies</span><span style={{ color: 'var(--color-header-muted2)' }}>{proxies.length}</span>
          </button>
          <button onClick={() => openTab('schedule', () => setShowScheduleModal(true))} className={`px-4 py-2 text-left flex justify-between transition-colors ${activeTab === 'schedule' ? 'font-bold' : ''}`} style={{ background: activeTab === 'schedule' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'schedule' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            <span>Calendario</span><span style={{ color: 'var(--color-header-muted2)' }}>{queue.filter(j => j.scheduled_ts).length}</span>
          </button>

          <div className="px-4 py-2 mt-2 border-t text-[10px] uppercase tracking-wider" style={{ borderColor: 'var(--color-sidebar-border)', color: 'var(--color-header-muted2)' }}>Herramientas</div>
          <button onClick={() => openTab('moneyprinter', () => setShowMoneyPrinterModal(true))} className={`px-4 py-2 text-left transition-colors ${activeTab === 'moneyprinter' ? 'font-bold' : ''}`} style={{ background: activeTab === 'moneyprinter' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'moneyprinter' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            Generador de Reels
          </button>
          <button onClick={() => openTab('adb', () => setShowAdbModal(true))} className={`px-4 py-2 text-left transition-colors ${activeTab === 'adb' ? 'font-bold' : ''}`} style={{ background: activeTab === 'adb' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'adb' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            ADB Bridge
          </button>
          <button onClick={() => openTab('curl', () => setShowCurlModal(true))} className={`px-4 py-2 text-left transition-colors ${activeTab === 'curl' ? 'font-bold' : ''}`} style={{ background: activeTab === 'curl' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'curl' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            cURL API
          </button>
          <button onClick={() => openTab('code', () => setShowCodeModal(true))} className={`px-4 py-2 text-left transition-colors ${activeTab === 'code' ? 'font-bold' : ''}`} style={{ background: activeTab === 'code' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'code' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            Código Python
          </button>
          <button onClick={() => openTab('versions', () => setShowVersionControlModal(true))} className={`px-4 py-2 text-left transition-colors ${activeTab === 'versions' ? 'font-bold' : ''}`} style={{ background: activeTab === 'versions' ? 'var(--color-sidebar-hover)' : undefined, color: activeTab === 'versions' ? 'var(--color-header-text)' : 'var(--color-sidebar-text)' }}>
            Versiones
          </button>
          <button onClick={handleDownloadAllZip} className="px-4 py-2 text-left transition-colors" style={{ color: 'var(--color-sidebar-text)' }}>
            Descargar ZIP
          </button>

          <div className="mt-auto px-4 py-3 border-t text-[10px]" style={{ borderColor: 'var(--color-sidebar-border)', color: 'var(--color-header-muted2)' }}>
            {stats.panda_grid_status} · cpu {stats.cpu_percent}%
          </div>
        </aside>

        {/* Contenido principal */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 grid-rows-[1fr_200px] gap-3 p-3 overflow-hidden">
        {/* Left Column: Accounts & ADB Devices (4 cols) */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <AccountsPanel
            accounts={accounts}
            proxies={proxies}
            onToggleBot={handleToggleBot}
            onAddAccount={handleAddAccount}
            onDeleteAccount={handleDeleteAccount}
            onSelectAccountForDetail={(acc) => setSelectedAccountForDetail(acc)}
          />
        </div>

        {/* Right Column: Video Production Queue (8 cols) */}
        <div className="lg:col-span-8 h-full overflow-hidden">
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

        {/* Bottom Full-Width Row: Live Terminal SSE Stream (12 cols) */}
        <div className={`lg:col-span-12 overflow-hidden ${terminalMinimized ? 'h-10' : 'h-full'}`}>
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
      {showProxyModal && (
        <ProxyModal
          isOpen={showProxyModal}
          proxies={proxies}
          onClose={() => setShowProxyModal(false)}
          onAddProxy={handleAddProxy}
          onVerifyProxy={handleVerifyProxy}
        />
      )}

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

      {showMoneyPrinterModal && (
        <MoneyPrinterModal
          accounts={accounts}
          initialAccount={moneyPrinterAccount || undefined}
          onClose={() => { setShowMoneyPrinterModal(false); setMoneyPrinterAccount(null); }}
          onRefreshData={refreshBackendData}
        />
      )}

      {/* Account Data & Analytics Consultation Modal */}
      {selectedAccountForDetail && (
        <AccountDetailModal
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
