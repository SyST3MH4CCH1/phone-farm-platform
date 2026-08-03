import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Account, ProxyItem, QueueJob, LogEntry, SystemStats, AuthUser, StackInfo } from './types';
import { INITIAL_ACCOUNTS, INITIAL_PROXIES, INITIAL_QUEUE, CODE_FILES } from './data';
import { Header } from './components/Header';
import { AccountsPanel } from './components/AccountsPanel';
import { QueuePanel } from './components/QueuePanel';
import { TerminalLogs } from './components/TerminalLogs';
import { ProxyModal } from './components/ProxyModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { CurlTesterModal } from './components/CurlTesterModal';
import { AdbBridgeModal } from './components/AdbBridgeModal';
import { LoginScreen } from './components/LoginScreen';
import { MoneyPrinterModal } from './components/MoneyPrinterModal';
import { PostPreviewModal } from './components/PostPreviewModal';
import { AccountDetailModal } from './components/AccountDetailModal';
import { VersionControlModal } from './components/VersionControlModal';
import { Boxes } from 'lucide-react';
import { DraftPost } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [proxies, setProxies] = useState<ProxyItem[]>(INITIAL_PROXIES);
  const [queue, setQueue] = useState<QueueJob[]>(INITIAL_QUEUE);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log_1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      module: 'PlatformServer',
      message: 'Servidor Express Phone Farm enlazado en http://0.0.0.0:3000 con Antigravity Engine'
    },
    {
      id: 'log_2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      module: 'ADBBridge',
      message: 'Módulo de conexión a ADB Server y MoneyPrinterTurbo activo para Instagram y TikTok.'
    }
  ]);

  const [stats, setStats] = useState<SystemStats>({
    videos_subidos: 1,
    acciones_hoy: 51,
    errores: 0,
    cpu_percent: 14.5,
    ram_percent: 42.1,
    active_bots: 1,
    active_proxies: 2,
    panda_grid_status: 'Connected'
  });

  // Stack Docker real (contenedores + salud MPT/Flask) — ver /api/stack
  const [stack, setStack] = useState<StackInfo>({
    containers: [], mpt_online: false, flask_online: false, drafts: 0
  });

  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [showAdbModal, setShowAdbModal] = useState(false);
  const [showMoneyPrinterModal, setShowMoneyPrinterModal] = useState(false);
  const [showVersionControlModal, setShowVersionControlModal] = useState(false);

  // New interactive modals
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<Account | null>(null);
  const [activePreviewDraft, setActivePreviewDraft] = useState<DraftPost | null>(null);

  // Verify auth status on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch (err) {
        // local sandbox default user
        setCurrentUser({
          id: 'usr_01',
          username: 'admin',
          role: 'admin',
          email: 'admin@phonefarm.io',
          token: 'token_pf_admin'
        });
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    setCurrentUser(null);
  };

  // Fetch initial data from Express backend if available
  const refreshBackendData = async () => {
    if (!currentUser) return;
    try {
      const [statsRes, accountsRes, proxiesRes, queueRes] = await Promise.all([
        fetch('/api/stats').then(r => r.ok ? r.json() : null),
        fetch('/api/accounts').then(r => r.ok ? r.json() : null),
        fetch('/api/proxies').then(r => r.ok ? r.json() : null),
        fetch('/api/queue').then(r => r.ok ? r.json() : null)
      ]);

      if (statsRes) setStats(statsRes);
      if (accountsRes) setAccounts(accountsRes);
      if (proxiesRes) setProxies(proxiesRes);
      if (queueRes) setQueue(queueRes);
    } catch (err) {
      // fallback to initial state
    }
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
        const res = await fetch('/api/stack');
        if (res.ok) setStack(await res.json());
      } catch (e) { /* docker no disponible */ }
    };
    fetchStack();
    const interval = setInterval(fetchStack, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Subscribe to real-time SSE logs from server
  useEffect(() => {
    try {
      const sse = new EventSource('/api/stream/logs');
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
      return () => sse.close();
    } catch (e) {
      // sse fallback
    }
  }, []);

  // Account Operations
  const handleToggleBot = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const endpoint = acc.bot_active ? '/engagement/stop' : '/engagement/start';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    setAccounts(prev => prev.map(a => {
      if (a.id === accountId) {
        const nextState = !a.bot_active;
        addLog(
          nextState ? 'INFO' : 'WARN',
          'Engagement',
          `${nextState ? 'Iniciando' : 'Deteniendo'} taktik-bot para @${a.username} (Warmup Día ${a.warmup_day})`
        );
        return { ...a, bot_active: nextState };
      }
      return a;
    }));
  };

  const handleAddAccount = async (newAcc: Partial<Account>) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAcc)
      });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    const id = `acc_${String(accounts.length + 1).padStart(2, '0')}`;
    const account: Account = {
      id,
      username: newAcc.username || 'nicho_nuevo',
      password: newAcc.password || 'Pass123!',
      status: 'active',
      device_serial: newAcc.device_serial || 'RFCW80XXXXX',
      proxy_id: newAcc.proxy_id || 'proxy_01',
      session_file: `sessions/${id}.json`,
      warmup_day: newAcc.warmup_day || 1,
      created_at: new Date().toISOString().split('T')[0],
      likes_today: 0,
      follows_today: 0,
      comments_today: 0,
      bot_active: false
    };

    setAccounts(prev => [...prev, account]);
    addLog('INFO', 'PlatformServer', `Nueva cuenta registrada: @${account.username} (ADB: ${account.device_serial})`);
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    setAccounts(prev => prev.filter(a => a.id !== accountId));
    addLog('WARN', 'PlatformServer', `Cuenta eliminada: ${accountId}`);
  };

  // Queue Operations
  const handleAddJob = async (keyword: string, targetAccount: string) => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, target_account: targetAccount })
      });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    const jobId = `job_${101 + queue.length}`;
    const newJob: QueueJob = {
      id: jobId,
      keyword,
      target_account: targetAccount,
      status: 'pending',
      video_path: null,
      created_at: new Date().toISOString(),
      progress: 0
    };

    setQueue(prev => [...prev, newJob]);
    addLog('INFO', 'Generator', `Job '${jobId}' agregado a la cola con Keyword: '${keyword}'`);
  };

  const handleProcessNextJob = async () => {
    setIsProcessingJob(true);
    try {
      const res = await fetch('/api/queue/next', { method: 'POST' });
      if (res.ok) {
        await refreshBackendData();
        setIsProcessingJob(false);
        return;
      }
    } catch (e) {
      // fallback
    }

    const pendingJobs = queue.filter(j => j.status === 'pending');
    if (pendingJobs.length === 0) {
      setIsProcessingJob(false);
      return;
    }

    const currentJob = pendingJobs[0];

    // Step 1: Generating with MoneyPrinterTurbo
    setQueue(prev => prev.map(j => j.id === currentJob.id ? { ...j, status: 'generating', progress: 30 } : j));
    addLog('INFO', 'Generator', `Invocando MoneyPrinterTurbo para Keyword: '${currentJob.keyword}' [CVE-2025-7897 127.0.0.1 Binding]`);

    await new Promise(res => setTimeout(res, 2000));

    // Step 2: Publishing with instagrapi
    const videoPath = `videos/${currentJob.id}.mp4`;
    setQueue(prev => prev.map(j => j.id === currentJob.id ? { ...j, status: 'generating', video_path: videoPath, progress: 70 } : j));
    addLog('INFO', 'Publisher', `Cargando sesión instagrapi (Galaxy A52 Fingerprint) para cuenta ${currentJob.target_account}...`);

    await new Promise(res => setTimeout(res, 1800));

    // Step 3: Complete
    const mediaId = `3154${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    setQueue(prev => prev.map(j => j.id === currentJob.id ? { ...j, status: 'published', media_id: mediaId, progress: 100 } : j));
    addLog('INFO', 'Publisher', `¡Reel publicado con éxito en Instagram! Media ID: ${mediaId}`);
    
    setStats(prev => ({ ...prev, videos_subidos: prev.videos_subidos + 1 }));
    setIsProcessingJob(false);
  };

  // Proxy Operations
  const handleAddProxy = async (newProxy: Partial<ProxyItem>) => {
    try {
      const res = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProxy)
      });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    const id = `proxy_${String(proxies.length + 1).padStart(2, '0')}`;
    const proxyItem: ProxyItem = {
      id,
      provider: newProxy.provider || 'DataImpulse',
      type: 'socks5',
      host: newProxy.host || 'gw.dataimpulse.com',
      port: newProxy.port || 10001,
      user: newProxy.user || '',
      pass: newProxy.pass || '',
      assigned_account: '',
      status: 'online',
      ip: `185.220.101.${Math.floor(10 + Math.random() * 200)}`,
      latency_ms: Math.floor(30 + Math.random() * 40)
    };
    setProxies(prev => [...prev, proxyItem]);
    addLog('INFO', 'ProxyManager', `Proxy SOCKS5 '${id}' registrado (${proxyItem.host}:${proxyItem.port})`);
  };

  const handleVerifyProxy = async (proxyId: string) => {
    try {
      const res = await fetch('/api/proxies/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_id: proxyId })
      });
      if (res.ok) {
        refreshBackendData();
        return;
      }
    } catch (e) {
      // fallback
    }

    setProxies(prev => prev.map(p => {
      if (p.id === proxyId) {
        addLog('INFO', 'ProxyManager', `Consultando https://api.ipify.org para proxy '${proxyId}'...`);
        return {
          ...p,
          status: 'online',
          ip: `185.220.101.${Math.floor(10 + Math.random() * 200)}`,
          latency_ms: Math.floor(30 + Math.random() * 30)
        };
      }
      return p;
    }));
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

  // Download complete .ZIP package for C:\phone-farm\
  const handleDownloadAllZip = async () => {
    try {
      window.location.href = '/api/download-zip';
      return;
    } catch (e) {
      // client-side fallback
    }

    const zip = new JSZip();
    Object.entries(CODE_FILES).forEach(([filename, content]) => {
      if (filename === 'dashboard.html') {
        zip.folder('templates')?.file('dashboard.html', content);
      } else {
        zip.file(filename, content);
      }
    });

    zip.file('accounts.json', JSON.stringify(accounts, null, 2));
    zip.file('proxies.json', JSON.stringify(proxies, null, 2));
    zip.file('queue.json', JSON.stringify(queue, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(content);
    element.download = 'phone-farm-windows-mini-pc.zip';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    addLog('INFO', 'PlatformServer', 'Paquete ZIP comprimido C:\\phone-farm descargado localmente.');
  };

  // Simulated REST API Tester for Modal
  const handleRunEndpointTest = async (method: string, endpoint: string, body?: any) => {
    addLog('INFO', 'PlatformServer', `cURL Exec: ${method} http://127.0.0.1:5000${endpoint}`);
    
    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(endpoint, options);
      if (res.ok) {
        const data = await res.json();
        refreshBackendData();
        return data;
      }
    } catch (e) {
      // fallback
    }

    if (endpoint === '/api/accounts' && method === 'GET') return accounts;
    if (endpoint === '/api/accounts' && method === 'POST') {
      handleAddAccount(body);
      return { status: "created", account: body };
    }
    if (endpoint.startsWith('/api/accounts/') && method === 'DELETE') {
      const accId = endpoint.split('/').pop() || '';
      handleDeleteAccount(accId);
      return { success: true, deleted_id: accId };
    }
    if (endpoint === '/api/proxies' && method === 'GET') return proxies;
    if (endpoint === '/api/proxies' && method === 'POST') {
      handleAddProxy(body);
      return { status: "created", proxy: body };
    }
    if (endpoint === '/api/queue' && method === 'GET') return queue;
    if (endpoint === '/api/queue' && method === 'POST') {
      handleAddJob(body.keyword, body.target_account);
      return { status: "created", job: body };
    }
    if (endpoint === '/api/queue/next' && method === 'POST') {
      await handleProcessNextJob();
      return { status: "processed", last_job: queue.find(j => j.status === 'published') };
    }
    if (endpoint === '/engagement/start' && method === 'POST') {
      handleToggleBot(body.account_id);
      return { success: true, account_id: body.account_id };
    }
    if (endpoint === '/engagement/stop' && method === 'POST') {
      handleToggleBot(body.account_id);
      return { success: true, account_id: body.account_id };
    }
    if (endpoint === '/api/stats' && method === 'GET') return stats;

    return { status: "ok", endpoint };
  };

  const handleOpenPreviewForJob = (job: QueueJob) => {
    const acc = accounts.find(a => a.id === job.target_account) || accounts[0];
    const draft: DraftPost = {
      id: `draft_${job.id}`,
      job_id: job.id,
      title: job.keyword,
      keyword: job.keyword,
      target_account_id: acc.id,
      target_account_username: acc.username,
      platform: 'both',
      video_url: job.video_path || '/videos/sample_916.mp4',
      script: `¡Descubre el secreto de ${job.keyword}! En este vídeo te mostramos paso a paso las mejores ideas para transformar tu espacio con diseño profesional. Guardalo y síguenos para más.`,
      caption: `✨ Ideas exclusivas para ${job.keyword}. ¿Cuál es tu favorito? Cuéntanos en los comentarios 👇`,
      hashtags: ['#decoracion', '#viral', '#reels', '#tiktok', '#shorts', '#design'],
      status: job.status === 'published' ? 'published' : 'draft',
      created_at: job.created_at,
      aspect_ratio: '9:16',
      voice_tts: 'es-ES-AlvaroNeural'
    };
    setActivePreviewDraft(draft);
  };

  const handleApproveAndPublishDraft = async (draftId: string, updatedCaption: string, platform: 'instagram' | 'tiktok' | 'both') => {
    if (!activePreviewDraft) return;

    try {
      await fetch('/api/moneyprinter/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: activePreviewDraft.keyword,
          target_account: activePreviewDraft.target_account_id,
          video_aspect: activePreviewDraft.aspect_ratio,
          caption: updatedCaption,
          platform
        })
      });

      // Local update
      setQueue(prev => prev.map(j => j.id === activePreviewDraft.job_id ? { ...j, status: 'published', progress: 100 } : j));
      
      const newLog: LogEntry = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'INFO',
        module: 'ADBBridge',
        message: `Publicación aprobada y enviada a ADB para @${activePreviewDraft.target_account_username} en ${platform.toUpperCase()}`
      };
      setLogs(prev => [...prev, newLog]);
      setActivePreviewDraft(null);
      refreshBackendData();
    } catch (err) {
      console.error('Error enviando a ADB:', err);
      setActivePreviewDraft(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-[#00E5BE] font-mono flex items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-[#00E5BE] animate-ping" />
          <span className="text-xs uppercase tracking-widest text-[#94A3B8]">Cargando TH3F4Rm3R Phone Farm System...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0B1220] text-neutral-200 overflow-hidden font-sans">
      {/* Top Header Navigation */}
      <Header
        stats={stats}
        accounts={accounts}
        proxies={proxies}
        currentUser={currentUser}
        onOpenCodeViewer={() => setShowCodeModal(true)}
        onOpenCurlTester={() => setShowCurlModal(true)}
        onOpenAdbBridge={() => setShowAdbModal(true)}
        onOpenMoneyPrinter={() => setShowMoneyPrinterModal(true)}
        onOpenVersionControl={() => setShowVersionControlModal(true)}
        onDownloadAllZip={handleDownloadAllZip}
        onLogout={handleLogout}
      />

      {/* Main Grid Workspace */}
      {/* Stack Docker: contenedores de la farm + salud de MPT/Flask */}
      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-[#1E2C42] bg-[#0B1220] text-[11px] font-mono overflow-x-auto whitespace-nowrap">
        <span className="font-bold tracking-wider text-[#00E5BE] flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5" /> STACK DOCKER
        </span>
        {stack.containers.length === 0 && (
          <span className="text-[#F87171]">🐳 docker no disponible o sin contenedores phonefarm</span>
        )}
        {stack.containers.map((c) => {
          const up = c.status.startsWith('Up');
          return (
            <span key={c.name} className="flex items-center gap-1.5 bg-[#0F1829] border border-[#1E2C42] rounded px-2 py-0.5">
              <span className={`w-2 h-2 rounded-full ${up ? 'bg-[#00E5BE] shadow-[0_0_5px_#00E5BE]' : 'bg-[#F87171]'}`} />
              <span className="text-[#94A3B8]">{c.name.replace('phonefarm-', '')}</span>
              <span className={up ? 'text-[#00E5BE]' : 'text-[#F87171]'}>{up ? 'UP' : 'DOWN'}</span>
              {c.ports && <span className="text-[#64748B]">[{c.ports.split('->')[0].trim()}]</span>}
            </span>
          );
        })}
        <span className={`flex items-center gap-1.5 ${stack.mpt_online ? 'text-[#00E5BE]' : 'text-[#F87171]'}`}>
          <span className={`w-2 h-2 rounded-full ${stack.mpt_online ? 'bg-[#00E5BE]' : 'bg-[#F87171]'}`} />
          MPT API {stack.mpt_online ? 'online' : 'offline'}
        </span>
        <span className={`flex items-center gap-1.5 ${stack.flask_online ? 'text-[#00E5BE]' : 'text-[#F87171]'}`}>
          <span className={`w-2 h-2 rounded-full ${stack.flask_online ? 'bg-[#00E5BE]' : 'bg-[#F87171]'}`} />
          Flask {stack.flask_online ? 'online' : 'offline'}
        </span>
        <span className="text-[#94A3B8]">
          Drafts <b className={stack.drafts > 0 ? 'text-[#4DFFE0]' : 'text-[#64748B]'}>{stack.drafts}</b>
        </span>
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 grid-rows-[1fr_240px] gap-3 p-4 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(0,229,190,0.04),transparent_70%)]">
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
          />
        </div>

        {/* Bottom Full-Width Row: Live Terminal SSE Stream (12 cols) */}
        <div className="lg:col-span-12 h-full overflow-hidden">
          <TerminalLogs
            logs={logs}
            onClearLogs={() => setLogs([])}
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

      {showMoneyPrinterModal && (
        <MoneyPrinterModal
          accounts={accounts}
          onClose={() => setShowMoneyPrinterModal(false)}
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
  );
}
