import { randomBytes } from "crypto";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { createFarmEngine } from "./farm-engine";
import { setupMcp } from "./mcp";

// ---------------------------------------------------------------------------
// Phone Farm Control Center — servidor Express + Gemini + MCP.
// Estado en memoria (mock): ver docs/AUDIT.md para el roadmap de persistencia.
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "pf_session";
const SESSION_MAX_AGE_SECONDS = 86400; // 24h

// Credenciales vía entorno. En producción el arranque falla sin ellas.
// En desarrollo se usan credenciales de demo con un WARN explícito.
const IS_DEV = process.env.NODE_ENV !== "production";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_DEV ? "admin123" : "");
const OPERATOR_USERNAME = process.env.OPERATOR_USERNAME || "operator";
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || (IS_DEV ? "operator123" : "");

if (process.env.NODE_ENV === "production" && (!ADMIN_PASSWORD || !OPERATOR_PASSWORD)) {
  console.error("[FATAL] En producción debe definir ADMIN_PASSWORD y OPERATOR_PASSWORD (ver .env.example).");
  process.exit(1);
}
if (IS_DEV && process.env.ADMIN_PASSWORD === undefined) {
  console.warn("[WARN] Desarrollo: usando credenciales de demo admin/admin123. Define ADMIN_PASSWORD para cambiarlas.");
}

// Lazy initialization of Gemini API
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return aiClient;
}

const engine = createFarmEngine(
  {
    accounts: [
      {
        id: "acc_01",
        username: "nicho_decoracion_01",
        password: "SecretPassword123",
        status: "active",
        device_serial: "RFCW80XXXXX",
        proxy_id: "proxy_01",
        session_file: "sessions/acc_01.json",
        warmup_day: 12,
        created_at: "2026-07-01",
        likes_today: 34,
        follows_today: 12,
        comments_today: 5,
        bot_active: true
      },
      {
        id: "acc_02",
        username: "fitness_motivation_es",
        password: "FitnessPass456!",
        status: "warmup",
        device_serial: "192.168.1.105:5555",
        proxy_id: "proxy_02",
        session_file: "sessions/acc_02.json",
        warmup_day: 4,
        created_at: "2026-07-27",
        likes_today: 18,
        follows_today: 6,
        comments_today: 2,
        bot_active: false
      }
    ],
    proxies: [
      {
        id: "proxy_01",
        provider: "DataImpulse",
        type: "socks5",
        host: "gw.dataimpulse.com",
        port: 10001,
        user: "user_token_abc",
        pass: "pass_token_123",
        assigned_account: "acc_01",
        status: "online",
        ip: "185.220.101.5",
        latency_ms: 42
      },
      {
        id: "proxy_02",
        provider: "DataImpulse",
        type: "socks5",
        host: "gw.dataimpulse.com",
        port: 10002,
        user: "user_token_def",
        pass: "pass_token_456",
        assigned_account: "acc_02",
        status: "online",
        ip: "185.220.101.99",
        latency_ms: 55
      }
    ],
    queue: [
      {
        id: "job_101",
        keyword: "decoracion sala moderna minimalista",
        target_account: "acc_01",
        status: "published",
        video_path: "videos/job_101.mp4",
        created_at: "2026-07-31T02:15:00Z",
        progress: 100,
        media_id: "3154829104928104",
        script: "Transforma tu sala con estos 3 tips minimalistas..."
      },
      {
        id: "job_102",
        keyword: "rutina alta intensidad brazos en casa",
        target_account: "acc_02",
        status: "pending",
        video_path: null,
        created_at: "2026-07-31T04:00:00Z",
        progress: 0
      }
    ]
  },
  { getAI }
);

engine.addLog("INFO", "PlatformServer", "Servidor Node/Express enlazado en http://0.0.0.0:3000 (Phone Farm Control Center)");
engine.addLog("INFO", "ADBBridge", "Módulo de conexión ADB y bridge de red inicializado.");

// --- Sesión y helpers de autenticación ---
let currentSessionUser: { id: string; username: string; role: "admin" | "operator"; email: string; token: string } | null = null;

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function getToken(req: express.Request): string | null {
  const cookieToken = parseCookies(req)[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getToken(req);
  if (currentSessionUser && token && token === currentSessionUser.token) {
    return next();
  }
  res.status(401).json({ error: "No autorizado. Inicia sesión primero." });
}

// Rate limiting simple por IP para /api/auth/login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 10) {
    return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos." });
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- AUTH ---

  app.post("/api/auth/login", loginRateLimit, (req, res) => {
    const { username, password } = req.body || {};

    let role: "admin" | "operator" | null = null;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) role = "admin";
    else if (username === OPERATOR_USERNAME && password === OPERATOR_PASSWORD) role = "operator";

    if (!role) {
      engine.addLog("WARN", "Auth", `Intento fallido de inicio de sesión para usuario: '${username}'`);
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = `token_pf_${randomBytes(18).toString("hex")}`;
    currentSessionUser = {
      id: `usr_${Math.random().toString(36).substring(2, 8)}`,
      username: username as string,
      role,
      email: `${username}@phonefarm.io`,
      token
    };
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`
    );
    engine.addLog("INFO", "Auth", `Inicio de sesión exitoso: Usuario '${currentSessionUser.username}' (${role.toUpperCase()})`);
    return res.json({ success: true, user: currentSessionUser });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (currentSessionUser) {
      engine.addLog("INFO", "Auth", `Cierre de sesión de usuario: '${currentSessionUser.username}'`);
    }
    currentSessionUser = null;
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
    res.json({ success: true, message: "Sesión cerrada correctamente" });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = getToken(req);
    if (currentSessionUser && token && token === currentSessionUser.token) {
      res.json({ authenticated: true, user: currentSessionUser });
    } else {
      res.json({ authenticated: false, user: null });
    }
  });

  // --- API protegida (requiere sesión) ---
  app.use("/api", requireAuth);

  // 1. Stats
  app.get("/api/stats", (req, res) => {
    res.json(engine.getStats());
  });

  // 2. Accounts
  app.get("/api/accounts", (req, res) => {
    res.json(engine.listAccounts());
  });

  app.post("/api/accounts", (req, res) => {
    const { username, password, device_serial, proxy_id, warmup_day } = req.body || {};
    res.status(201).json(engine.createAccount({ username, password, device_serial, proxy_id, warmup_day }));
  });

  app.delete("/api/accounts/:id", (req, res) => {
    const ok = engine.deleteAccount(req.params.id);
    if (!ok) return res.status(404).json({ error: "Account not found" });
    res.json({ success: true, id: req.params.id });
  });

  // Engagement bots
  app.post("/engagement/start", (req, res) => {
    const r = engine.toggleBot(req.body?.account_id, true);
    if (!r) return res.status(404).json({ error: "Account not found" });
    res.json(r);
  });

  app.post("/engagement/stop", (req, res) => {
    const r = engine.toggleBot(req.body?.account_id, false);
    if (!r) return res.status(404).json({ error: "Account not found" });
    res.json(r);
  });

  // 3. Proxies
  app.get("/api/proxies", (req, res) => {
    res.json(engine.listProxies());
  });

  app.post("/api/proxies", (req, res) => {
    const { provider, type, host, port, user, pass } = req.body || {};
    res.status(201).json(engine.createProxy({ provider, type, host, port, user, pass }));
  });

  app.post("/api/proxies/verify", async (req, res) => {
    const proxy = await engine.verifyProxy(req.body?.proxy_id);
    if (!proxy) return res.status(404).json({ error: "Proxy non-existent" });
    res.json(proxy);
  });

  // 4. Queue & AI Script Generation
  app.get("/api/queue", (req, res) => {
    res.json(engine.listQueue());
  });

  app.post("/api/queue", (req, res) => {
    const { keyword, target_account } = req.body || {};
    res.status(201).json(engine.createJob(keyword, target_account));
  });

  app.post("/api/queue/next", async (req, res) => {
    const pendingJob = await engine.processNextJob();
    if (!pendingJob) return res.json({ message: "No hay trabajos pendientes en la cola." });
    res.json(pendingJob);
  });

  // 5. MoneyPrinterTurbo Engine Integration
  app.get("/api/moneyprinter/config", (req, res) => {
    res.json(engine.getMoneyPrinterConfig());
  });

  app.post("/api/moneyprinter/config", (req, res) => {
    const config = engine.updateMoneyPrinterConfig(req.body || {});
    res.json({ success: true, config });
  });

  app.post("/api/moneyprinter/test-pexels", async (req, res) => {
    const result = await engine.testPexels(req.body?.pexels_api_key);
    res.json(result);
  });

  app.get("/api/moneyprinter/voices", (req, res) => {
    res.json(engine.getVoices());
  });

  app.post("/api/moneyprinter/generate", async (req, res) => {
    const { keyword, target_account, custom_prompt, video_aspect, voice_name } = req.body || {};
    const { job, config_used } = await engine.generateVideo({ keyword, target_account, custom_prompt, video_aspect, voice_name });
    res.json({ success: true, job, config_used });
  });

  // 6. ADB Bridge
  app.get("/api/adb/config", (req, res) => {
    res.json(engine.getBridgeConfig());
  });

  app.post("/api/adb/test-connection", async (req, res) => {
    const { mini_pc_ip, mini_pc_port, adb_host, adb_port } = req.body || {};
    res.json(await engine.testAdbConnection({ mini_pc_ip, mini_pc_port, adb_host, adb_port }));
  });

  // 7. Logs
  app.get("/api/logs", (req, res) => {
    res.json(engine.getLogs());
  });

  // SSE: emite únicamente logs nuevos por conexión
  app.get("/api/stream/logs", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let lastSentId = engine.getLogs(1)[0]?.id || "";
    res.write(`data: ${JSON.stringify({ message: "Conectado al Stream SSE de la Phone Farm" })}\n\n`);

    const interval = setInterval(() => {
      const logs = engine.getLogs();
      const fresh = logs.filter((l) => l.id !== lastSentId);
      for (const log of fresh) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
      if (fresh.length > 0) lastSentId = fresh[fresh.length - 1].id;
    }, 2000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // 8. Download ZIP
  app.get("/api/download-zip", async (req, res) => {
    const zip = new JSZip();
    zip.file("accounts.json", JSON.stringify(engine.listAccounts(), null, 2));
    zip.file("proxies.json", JSON.stringify(engine.listProxies(), null, 2));
    zip.file("queue.json", JSON.stringify(engine.listQueue(), null, 2));

    const zipContent = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=phone-farm-config.zip");
    res.send(zipContent);
  });

  // 9. MCP server (Model Context Protocol) — para agentes
  setupMcp(app, engine);

  // API desconocida -> 404 JSON (antes del fallback SPA)
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Ruta API no encontrada" });
  });

  // Mount Vite Middleware in Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server Phone Farm running on http://localhost:${PORT}`);
  });
}

startServer();
