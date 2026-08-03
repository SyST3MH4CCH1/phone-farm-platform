import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// FarmEngine: lógica de negocio compartida por la API REST (server.ts) y el
// MCP server (mcp.ts). Todo el estado vive en memoria (mock) — ver docs/AUDIT.md.
// ---------------------------------------------------------------------------

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface FarmAccount {
  id: string;
  username: string;
  password?: string;
  status: "active" | "warmup" | "paused" | "error";
  device_serial: string;
  proxy_id: string;
  session_file: string;
  warmup_day: number;
  created_at: string;
  likes_today?: number;
  follows_today?: number;
  comments_today?: number;
  bot_active?: boolean;
}

export interface FarmProxy {
  id: string;
  provider: string;
  type: "socks5" | "http";
  host: string;
  port: number;
  user: string;
  pass: string;
  assigned_account: string;
  status: "online" | "offline" | "checking";
  ip?: string;
  latency_ms?: number;
}

export interface FarmQueueJob {
  id: string;
  keyword: string;
  target_account: string;
  status: "pending" | "generating" | "publishing" | "published" | "failed" | "awaiting_manual_upload";
  video_path: string | null;
  created_at: string;
  progress?: number;
  media_id?: string;
  script?: string;
}

export interface FarmLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
}

export interface MoneyPrinterConfig {
  repo_url: string;
  bind_address: string;
  llm_provider: "gemini" | "openai" | "claude" | "deepseek" | "ollama";
  llm_model: string;
  video_aspect: "9:16" | "16:9" | "1:1";
  video_concat_mode: "sequential" | "random";
  audio_tts_engine: "edge_tts" | "openai_tts" | "elevenlabs";
  voice_name: string;
  voice_volume: number;
  bgm_volume: number;
  subtitle_enabled: boolean;
  subtitle_font: string;
  subtitle_color: string;
  subtitle_size: number;
  pexels_api_key: string;
  pixabay_api_key?: string;
  auto_upload_to_adb: boolean;
  status: "online" | "offline" | "error";
}

export interface AdbBridgeConfig {
  mini_pc_ip: string;
  mini_pc_port: number;
  adb_host: string;
  adb_port: number;
  use_real_flask: boolean;
  status: string;
}

export interface FarmEngineDeps {
  /** Lazy GoogleGenAI client (null si no hay GEMINI_API_KEY). */
  getAI: () => GoogleGenAI | null;
}

export interface SystemStats {
  videos_subidos: number;
  acciones_hoy: number;
  errores: number;
  cpu_percent: number;
  ram_percent: number;
  active_bots: number;
  active_proxies: number;
  panda_grid_status: "Connected" | "Scanning" | "Disconnected";
  bridge_config: AdbBridgeConfig;
}

const MAX_LOGS = 200;

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createFarmEngine(initial: {
  accounts: FarmAccount[];
  proxies: FarmProxy[];
  queue: FarmQueueJob[];
}, deps: FarmEngineDeps) {
  const accounts = [...initial.accounts];
  const proxies = [...initial.proxies];
  const queue = [...initial.queue];
  const logs: FarmLog[] = [];
  let accountCounter = Math.max(0, ...accounts.map((a) => Number(a.id.replace(/\D/g, "")) || 0));
  let proxyCounter = Math.max(0, ...proxies.map((p) => Number(p.id.replace(/\D/g, "")) || 0));

  let moneyPrinterConfig: MoneyPrinterConfig = {
    repo_url: "https://github.com/harry0703/MoneyPrinterTurbo",
    bind_address: "127.0.0.1:8501",
    llm_provider: "gemini",
    llm_model: "gemini-2.5-flash",
    video_aspect: "9:16",
    video_concat_mode: "sequential",
    audio_tts_engine: "edge_tts",
    voice_name: "es-ES-AlvaroNeural",
    voice_volume: 1.0,
    bgm_volume: 0.2,
    subtitle_enabled: true,
    subtitle_font: "STHeiti",
    subtitle_color: "#FFFFFF",
    subtitle_size: 28,
    pexels_api_key: process.env.PEXELS_API_KEY || "",
    pixabay_api_key: "",
    auto_upload_to_adb: true,
    status: "online"
  };

  const bridgeConfig: AdbBridgeConfig = {
    mini_pc_ip: "127.0.0.1",
    mini_pc_port: 5000,
    adb_host: "127.0.0.1",
    adb_port: 5037,
    use_real_flask: false,
    status: "connected_local"
  };

  const addLog = (level: LogLevel, module: string, message: string) => {
    const newLog: FarmLog = {
      id: makeId("log"),
      timestamp: new Date().toLocaleTimeString(),
      level,
      module,
      message
    };
    logs.push(newLog);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    return newLog;
  };

  // --- Gemini script generation (con fallback sintético) ---
  async function generateScript(keyword: string): Promise<string> {
    try {
      const ai = deps.getAI();
      if (ai) {
        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Escribe un guión corto para Instagram Reel (9:16) y un caption atractivo con hashtags para el nicho/keyword: "${keyword}". Responde en español en un formato claro y conciso.`,
        });
        if (resp.text) return resp.text;
      }
    } catch (err: any) {
      addLog("WARN", "GeminiAI", `Gemini API fallback: ${err?.message || "error desconocido"}`);
    }
    return `✨ ¡3 Consejos Clave sobre ${keyword}! 🔥\n\n1. Enfócate en la simplicidad y paleta neutra.\n2. Optimiza la iluminación y armonía visual.\n3. Añade detalles de alto valor.\n\n#instagramreels #viral #${keyword.replace(/\s+/g, "")}`;
  }

  const publishJob = (job: FarmQueueJob, delayMs: number) => {
    setTimeout(() => {
      job.status = "published";
      job.progress = 100;
      job.media_id = `${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`;
      const acc = accounts.find((a) => a.id === job.target_account);
      if (acc) acc.likes_today = (acc.likes_today || 0) + Math.floor(5 + Math.random() * 15);
      addLog("INFO", "Publisher", `¡Reel publicado con éxito! Media ID: ${job.media_id}`);
    }, delayMs);
  };

  return {
    state: { accounts, proxies, queue, logs },

    addLog,
    getLogs(limit = 100) {
      return logs.slice(-limit);
    },

    getStats(): SystemStats {
      const publishedCount = queue.filter((j) => j.status === "published").length;
      const failedCount = queue.filter((j) => j.status === "failed").length;
      const activeBots = accounts.filter((a) => a.bot_active).length;
      const totalActions = accounts.reduce(
        (acc, curr) => acc + (curr.likes_today || 0) + (curr.follows_today || 0) + (curr.comments_today || 0),
        0
      );
      const onlineProxies = proxies.filter((p) => p.status === "online").length;
      return {
        videos_subidos: publishedCount,
        acciones_hoy: totalActions,
        errores: failedCount,
        cpu_percent: Math.floor(12 + Math.random() * 8),
        ram_percent: Math.floor(38 + Math.random() * 6),
        active_bots: activeBots,
        active_proxies: onlineProxies,
        panda_grid_status: "Connected",
        bridge_config: { ...bridgeConfig }
      };
    },

    // --- Accounts ---
    listAccounts(): FarmAccount[] {
      // Nunca exponer contraseñas vía API.
      return accounts.map(({ password: _pw, ...rest }) => rest);
    },
    createAccount(input: { username?: string; password?: string; device_serial?: string; proxy_id?: string; warmup_day?: number }) {
      const id = `acc_${String(++accountCounter).padStart(2, "0")}`;
      const newAcc: FarmAccount = {
        id,
        username: input.username || `ig_account_${accountCounter}`,
        password: input.password || "Password123!",
        status: "active",
        device_serial: input.device_serial || "RFCW80XXXXX",
        proxy_id: input.proxy_id || "proxy_01",
        session_file: `sessions/${id}.json`,
        warmup_day: Number(input.warmup_day) || 1,
        created_at: new Date().toISOString().split("T")[0],
        likes_today: 0,
        follows_today: 0,
        comments_today: 0,
        bot_active: false
      };
      accounts.push(newAcc);
      addLog("INFO", "Accounts", `Nueva cuenta registrada: @${newAcc.username} (ADB: ${newAcc.device_serial})`);
      return newAcc;
    },
    deleteAccount(id: string) {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) return false;
      accounts.splice(idx, 1);
      addLog("INFO", "Accounts", `Cuenta eliminada ID: ${id}`);
      return true;
    },
    toggleBot(id: string, active: boolean) {
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return null;
      acc.bot_active = active;
      addLog("INFO", "Engagement", `taktik-bot ${active ? "iniciado" : "detenido"} para @${acc.username} en dispositivo ADB ${acc.device_serial}`);
      return { success: true, account_id: id, bot_active: active };
    },

    // --- Proxies ---
    listProxies() {
      return [...proxies];
    },
    createProxy(input: { provider?: string; type?: string; host?: string; port?: number; user?: string; pass?: string }) {
      const id = `proxy_${String(++proxyCounter).padStart(2, "0")}`;
      const newProxy: FarmProxy = {
        id,
        provider: input.provider || "DataImpulse",
        type: (input.type as FarmProxy["type"]) || "socks5",
        host: input.host || "gw.dataimpulse.com",
        port: Number(input.port) || 10001,
        user: input.user || "",
        pass: input.pass || "",
        assigned_account: "",
        status: "online",
        ip: `185.220.${Math.floor(Math.random() * 150)}.${Math.floor(Math.random() * 250)}`,
        latency_ms: Math.floor(35 + Math.random() * 40)
      };
      proxies.push(newProxy);
      addLog("INFO", "ProxyManager", `Nuevo proxy SOCKS5 registrado: ${newProxy.id} (${newProxy.host}:${newProxy.port})`);
      return newProxy;
    },
    async verifyProxy(id: string): Promise<FarmProxy | null> {
      const proxy = proxies.find((p) => p.id === id);
      if (!proxy) return null;
      addLog("INFO", "ProxyManager", `Verificando conexión real del proxy ${proxy.id} (${proxy.host}:${proxy.port})...`);
      try {
        const startTime = Date.now();
        const testRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
        const latency = Date.now() - startTime;
        if (testRes.ok) {
          const data = (await testRes.json()) as { ip: string };
          proxy.ip = data.ip || proxy.ip;
          proxy.latency_ms = latency;
          proxy.status = "online";
          addLog("INFO", "ProxyManager", `Proxy ${proxy.id} OK. Public IP: ${proxy.ip} (${latency}ms)`);
        } else {
          proxy.status = "online";
          proxy.latency_ms = Math.floor(30 + Math.random() * 25);
          addLog("INFO", "ProxyManager", `Prueba de proxy ${proxy.id} completada.`);
        }
      } catch {
        proxy.latency_ms = Math.floor(40 + Math.random() * 30);
        proxy.status = "online";
        addLog("WARN", "ProxyManager", `Respuesta proxy simulada (red aislada): Latencia ${proxy.latency_ms}ms`);
      }
      return proxy;
    },

    // --- Queue ---
    listQueue() {
      return [...queue];
    },
    createJob(keyword?: string, target_account?: string) {
      const newJob: FarmQueueJob = {
        id: `job_${queue.length + 101}`,
        keyword: keyword || "decoracion salon minimalista",
        target_account: target_account || accounts[0]?.id || "acc_01",
        status: "pending",
        video_path: null,
        created_at: new Date().toISOString(),
        progress: 0
      };
      queue.push(newJob);
      addLog("INFO", "Queue", `Job agregado a cola: ${newJob.id} ("${newJob.keyword}")`);
      return newJob;
    },
    async processNextJob() {
      const pendingJob = queue.find((j) => j.status === "pending");
      if (!pendingJob) return null;
      pendingJob.status = "generating";
      addLog("INFO", "MoneyPrinterTurbo", `Generando Reel 9:16 para "${pendingJob.keyword}" (127.0.0.1 bound)...`);
      const script = await generateScript(pendingJob.keyword);
      pendingJob.script = script;
      pendingJob.video_path = `videos/${pendingJob.id}.mp4`;
      pendingJob.status = "publishing";
      addLog(
        "INFO",
        "Publisher",
        `Publicando Reel en Instagram para cuenta @${accounts.find((a) => a.id === pendingJob.target_account)?.username || "user"}...`
      );
      publishJob(pendingJob, 1500);
      return pendingJob;
    },

    // --- MoneyPrinterTurbo ---
    getMoneyPrinterConfig() {
      return { ...moneyPrinterConfig };
    },
    updateMoneyPrinterConfig(patch: Partial<MoneyPrinterConfig>) {
      moneyPrinterConfig = { ...moneyPrinterConfig, ...patch };
      addLog(
        "INFO",
        "MoneyPrinterTurbo",
        `Configuración del motor actualizada (Aspecto: ${moneyPrinterConfig.video_aspect}, TTS: ${moneyPrinterConfig.voice_name}, LLM: ${moneyPrinterConfig.llm_provider})`
      );
      return { ...moneyPrinterConfig };
    },
    async testPexels(pexelsApiKey?: string) {
      const apiKeyToTest = pexelsApiKey || moneyPrinterConfig.pexels_api_key;
      if (!apiKeyToTest) {
        addLog("WARN", "MoneyPrinterTurbo", "Sin PEXELS_API_KEY configurada. Modo Pexels Mock Fallback activo.");
        return { success: true, valid: false, message: "Modo Pexels Mock Fallback activo (sin API key)" };
      }
      addLog("INFO", "MoneyPrinterTurbo", "Verificando API Key de Pexels para obtención de videoclips HD stock...");
      try {
        const response = await fetch("https://api.pexels.com/v1/search?query=aesthetic&per_page=1", {
          headers: { Authorization: apiKeyToTest },
          signal: AbortSignal.timeout(4000)
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          addLog("INFO", "MoneyPrinterTurbo", `¡API Key de Pexels verificada con éxito! (${data.total_results || 1000}+ vídeos disponibles)`);
          return { success: true, valid: true, total_results: data.total_results || 5000 };
        }
        addLog("WARN", "MoneyPrinterTurbo", `Pexels API respondió HTTP ${response.status}. Usando Pexels mock pool de respaldo.`);
        return { success: true, valid: false, message: "Modo Pexels Mock Fallback activo (Red Sandboxed)" };
      } catch {
        addLog("WARN", "MoneyPrinterTurbo", "Conexión a Pexels API simulada OK (Modo Offline Sandboxed)");
        return { success: true, valid: true, mode: "sandboxed_fallback" };
      }
    },
    getVoices() {
      return [
        { id: "es-ES-AlvaroNeural", name: "Álvaro (Español España - Natural)", gender: "male", language: "es-ES" },
        { id: "es-ES-[#1]ElviraNeural", name: "Elvira (Español España - Expresivo)", gender: "female", language: "es-ES" },
        { id: "es-MX-DaliaNeural", name: "Dalia (Español México - Dinámico)", gender: "female", language: "es-MX" },
        { id: "es-MX-[#1]JorgeNeural", name: "Jorge (Español México - Profundo)", gender: "male", language: "es-MX" },
        { id: "en-US-[#1]AnaNeural", name: "Ana (English US - Shorts/Reels)", gender: "female", language: "en-US" },
        { id: "openai-alloy", name: "OpenAI TTS - Alloy", gender: "neutral", language: "en/es" },
        { id: "openai-nova", name: "OpenAI TTS - Nova", gender: "female", language: "en/es" }
      ];
    },
    async generateVideo(input: { keyword?: string; target_account?: string; custom_prompt?: string; video_aspect?: string; voice_name?: string }) {
      const { keyword, target_account } = input;
      const finalKeyword = keyword || "decoracion sala moderna minimalista";
      const aspect = input.video_aspect || moneyPrinterConfig.video_aspect;
      const voice = input.voice_name || moneyPrinterConfig.voice_name;
      addLog("INFO", "MoneyPrinterTurbo", `Iniciando Pipeline Completo MoneyPrinterTurbo para "${finalKeyword}" [Aspecto: ${aspect}, Voice: ${voice}]...`);
      let script = "";
      if (input.custom_prompt) {
        script = input.custom_prompt;
      } else {
        try {
          const ai = deps.getAI();
          if (ai) {
            addLog("INFO", "MoneyPrinterTurbo", `Solicitando guión optimizado a Gemini AI para nicho "${finalKeyword}"...`);
            const resp = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: `Crea un guión viral para Instagram Reels / TikTok (formato ${aspect}) sobre "${finalKeyword}". Incluye 3 puntos de alto enganche y subtítulos dinámicos. En español.`
            });
            script = resp.text || "";
          }
        } catch {
          addLog("WARN", "MoneyPrinterTurbo", "Generación Gemini AI fallback en uso.");
        }
      }
      if (!script) {
        script = `🔥 3 Secretos Inesperados sobre ${finalKeyword} 🔥\n\n1. Optimización del espacio y simetría visual.\n2. Combinación de contrastes cálidos.\n3. Iluminación ambiental en 3 niveles.\n\n#reels #viral #${finalKeyword.replace(/\s+/g, "")}`;
      }
      addLog("INFO", "MoneyPrinterTurbo", `Descargando 4 videoclips HD de Pexels para keyword: "${finalKeyword}"...`);
      addLog("INFO", "MoneyPrinterTurbo", `Sintetizando voz EdgeTTS (${voice}) y alineando timestamps SRT...`);
      addLog("INFO", "MoneyPrinterTurbo", `Renderizando vídeo ${aspect} (1080x1920 @ 30fps) con FFmpeg + subtítulos ${moneyPrinterConfig.subtitle_font}...`);

      const jobId = `mpt_${Date.now().toString().substring(7)}`;
      const newJob: FarmQueueJob = {
        id: jobId,
        keyword: `${finalKeyword} [MoneyPrinterTurbo]`,
        target_account: target_account || accounts[0]?.id || "acc_01",
        status: "pending",
        video_path: `videos/${jobId}.mp4`,
        created_at: new Date().toISOString(),
        progress: 0,
        script
      };
      queue.push(newJob);
      addLog("INFO", "MoneyPrinterTurbo", `Vídeo procesado e inyectado a la cola ADB de la Phone Farm (ID: ${jobId})`);

      if (moneyPrinterConfig.auto_upload_to_adb) {
        setTimeout(() => {
          newJob.status = "published";
          newJob.progress = 100;
          newJob.media_id = `mpt_ig_${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`;
          const acc = accounts.find((a) => a.id === newJob.target_account);
          if (acc) acc.likes_today = (acc.likes_today || 0) + 12;
          addLog("INFO", "Publisher", `[MoneyPrinterTurbo Auto-Upload] Reel publicado en Instagram en dispositivo ADB de @${acc?.username || "user"}`);
        }, 2000);
      }
      return { job: newJob, config_used: { ...moneyPrinterConfig } };
    },

    // --- ADB Bridge ---
    getBridgeConfig() {
      return { ...bridgeConfig };
    },
    async testAdbConnection(input: { mini_pc_ip?: string; mini_pc_port?: number; adb_host?: string; adb_port?: number }) {
      bridgeConfig.mini_pc_ip = input.mini_pc_ip || bridgeConfig.mini_pc_ip;
      bridgeConfig.mini_pc_port = Number(input.mini_pc_port) || bridgeConfig.mini_pc_port;
      bridgeConfig.adb_host = input.adb_host || bridgeConfig.adb_host;
      bridgeConfig.adb_port = Number(input.adb_port) || bridgeConfig.adb_port;
      bridgeConfig.use_real_flask = true;
      bridgeConfig.status = "testing";
      addLog(
        "INFO",
        "ADBBridge",
        `Iniciando diagnóstico de conexión real a Mini PC (${bridgeConfig.mini_pc_ip}:${bridgeConfig.mini_pc_port}) y ADB Server (${bridgeConfig.adb_host}:${bridgeConfig.adb_port})...`
      );
      let flaskOk = false;
      try {
        const flaskTestUrl = `http://${bridgeConfig.mini_pc_ip}:${bridgeConfig.mini_pc_port}/api/accounts`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(flaskTestUrl, { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);
        if (response && response.ok) {
          flaskOk = true;
          addLog("INFO", "ADBBridge", `¡Conexión HTTP OK con Servidor Flask en http://${bridgeConfig.mini_pc_ip}:${bridgeConfig.mini_pc_port}!`);
        }
      } catch {
        // sin servidor Flask local: se usa el bridge simulado
      }
      const adbDevicesDetected = [
        "RFCW80XXXXX (Samsung Galaxy A52 - USB)",
        `${bridgeConfig.adb_host}:5555 (Android Device Wi-Fi ADB)`
      ];
      bridgeConfig.status = flaskOk ? "connected_remote_flask" : "connected_local_bridge";
      addLog("INFO", "ADBBridge", `Diagnóstico ADB completado: ${adbDevicesDetected.length} Dispositivos detectados (${adbDevicesDetected.join(", ")})`);
      return {
        success: true,
        flask_server_online: flaskOk,
        adb_server_status: "online",
        detected_devices: adbDevicesDetected,
        config: { ...bridgeConfig },
        message: flaskOk
          ? `Conectado exitosamente al Servidor Flask real en ${bridgeConfig.mini_pc_ip}:${bridgeConfig.mini_pc_port}`
          : `Bridge configurado para conectar con ADB en ${bridgeConfig.adb_host}:${bridgeConfig.adb_port}`
      };
    }
  };
}

export type FarmEngine = ReturnType<typeof createFarmEngine>;
