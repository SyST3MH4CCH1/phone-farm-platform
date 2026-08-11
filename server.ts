import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { exec, execFile } from "child_process";
import dotenv from "dotenv";

// Cargar .env de la raíz ANTES de leer cualquier process.env (tsx no lo hace solo).
dotenv.config();
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Phone Farm Control Center — panel React (Express) -> proxy al backend Flask.
// El ESTADO REAL vive en plataforma Flask (:5000). Este servidor solo sirve la
// SPA y reenvía la API; sin mocks de pipeline/ADB/métricas.
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "pf_session";
const SESSION_MAX_AGE_SECONDS = 86400; // 24h

// Credenciales vía entorno. En producción el arranque falla sin ellas.
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

// Backend REAL = Flask (:5000). Loopback; CORS está permitido desde Flask.
const FLASK_BASE = process.env.FLASK_BASE || "http://127.0.0.1:5000";

// --- Sesiones y helpers de autenticación ---
// Almacén multi-sesión en memoria: token-hash -> sesión (AUDIT-001/002).
// Reiniciar el proceso cierra todas las sesiones (documentado en MANUAL.md §6).
interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "operator";
  email: string;
  expiresAt: number;
}
const sessions = new Map<string, SessionUser>(); // key = sha256(token)

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación resistente a timing attacks (AUDIT-006). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Devuelve la sesión vigente asociada al token, o null si expiró/no existe. */
function getSession(token: string | null): SessionUser | null {
  if (!token) return null;
  const s = sessions.get(hashToken(token));
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(hashToken(token));
    return null;
  }
  return s;
}

// Limpieza periódica de sesiones expiradas (cada 10 min).
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.expiresAt < now) sessions.delete(k);
}, 10 * 60 * 1000).unref();

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
  const user = getSession(getToken(req));
  if (user) {
    (req as any).user = user;
    return next();
  }
  res.status(401).json({ error: "No autorizado. Inicia sesión primero." });
}

/** RBAC: solo admin (AUDIT-008/009/010). Requiere requireAuth previo. */
function requireRole(role: "admin") {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user as SessionUser | undefined;
    if (user && user.role === role) return next();
    res.status(403).json({ error: `Requiere rol ${role}.` });
  };
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

// 0.6 Proxy genérico a Flask (auth interno entre servicios).
// SIN fallback embebido: en producción exige PHONE_FARM_INTERNAL_TOKEN (AUDIT-004/SEC).
const INTERNAL_TOKEN = process.env.PHONE_FARM_INTERNAL_TOKEN || "";
if (!INTERNAL_TOKEN) {
  console.warn("[WARN] PHONE_FARM_INTERNAL_TOKEN no definido — backend Flask rechazará las llamadas hasta configurarlo.");
}

async function flask(
  _req: express.Request,
  res: express.Response,
  method: "GET" | "POST" | "DELETE" | "PATCH",
  flaskPath: string,
  jsonBody?: unknown,
  timeoutMs = 20000, // default 20s; rutas pesadas (adb/devices ~30s+) pasan más
) {
  try {
    const r = await fetch(`${FLASK_BASE}${flaskPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:3000",
        "X-Internal-Auth": INTERNAL_TOKEN,
      },
      body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    res.status(r.status).json(data);
  } catch (err) {
    res.status(503).json({
      error: `Backend Flask no alcanzable en ${FLASK_BASE}${flaskPath}`,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Ejecuta `adb` del host (platform-tools) y devuelve salida o null si falla. */
function runHostExec(file: string, args: string[], timeout = 8000): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (err, stdout) => resolve(err ? "" : stdout));
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- AUTH (local al panel; Flask es loopback y libre) ---

  app.post("/api/auth/login", loginRateLimit, (req, res) => {
    const { username, password } = req.body || {};
    const u = typeof username === "string" ? username : "";
    const p = typeof password === "string" ? password : "";

    let role: "admin" | "operator" | null = null;
    if (safeEqual(u, ADMIN_USERNAME) && safeEqual(p, ADMIN_PASSWORD)) role = "admin";
    else if (safeEqual(u, OPERATOR_USERNAME) && safeEqual(p, OPERATOR_PASSWORD)) role = "operator";

    if (!role) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = `token_pf_${randomBytes(18).toString("hex")}`;
    const user: SessionUser = {
      id: `usr_${randomBytes(4).toString("hex")}`,
      username: u,
      role,
      email: `${u}@phonefarm.local`,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };
    sessions.set(hashToken(token), user); // no pisar otras sesiones: un token por login
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`
    );
    // AUDIT-007: nunca devolver el token en el body (va solo en cookie HttpOnly).
    return res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  });

  // AUDIT-002: logout exige sesión y solo revoca LA sesión actual (no todas).
  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = getToken(req);
    if (token) sessions.delete(hashToken(token));
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
    res.json({ success: true, message: "Sesión cerrada correctamente" });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getSession(getToken(req));
    if (user) {
      res.json({ authenticated: true, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
    } else {
      res.json({ authenticated: false, user: null });
    }
  });

  // --- API protegida (requiere sesión del panel) ---
  // AUDIT-005: protegemos también /engagement/* y /videos/*, que NO empiezan por /api
  // y antes quedaban como vía sin sesión (arrancar bots sin login).
  app.use("/api", requireAuth);
  app.use("/engagement", requireAuth);
  app.use("/videos", requireAuth);

  // 1. Stats (real, desde Flask)
  app.get("/api/stats", (req, res) => flask(req, res, "GET", "/api/stats"));

  // 0.5 Stack: contenedores Docker O procesos nativos de la farm (solo lectura).
  // El Express corre en el host -> consulta `docker ps` o los procesos locales.
  // Cache de 10 s: las probes de PowerShell tardan segundos con CPU saturada y
  // el panel pregunta cada 5 s (sin cache el header titilaba entre estados).
  let stackCache: { at: number; body: unknown } | null = null;
  app.get("/api/stack", async (req, res) => {
    if (stackCache && Date.now() - stackCache.at < 10_000) {
      return res.json(stackCache.body);
    }
    const run = (cmd: string, timeout = 4000) =>
      new Promise<string>((resolve) => {
        exec(cmd, { timeout }, (err, stdout) => resolve(err ? "" : stdout));
      });
    // Docker existe? (where docker) — si no, saltar directo al modo nativo.
    const dockerExists = (await run("where docker", 2000)).trim().length > 0;

    let containers: { name: string; status: string; ports: string }[] = [];
    if (dockerExists) {
      const raw = await run('docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}"', 4000);
      containers = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, status, ports] = line.split("|");
          return { name, status, ports: ports || "" };
        })
        .filter((c) => c.name.includes("phonefarm"));
    }

    // Modo nativo: procesos dueños de los puertos del stack (5000/5001/8080).
    // En Windows los venvs spawnan el exe base -> se lista la cadena padre/hijo.
    // Las probes se disparan EN PARALELO (antes eran 6 execs secuenciales de PS).
    let native: string[] = [];
    if (containers.length === 0) {
      const probes: { name: string; port: number }[] = [
        { name: "platform", port: 5000 }, // Flask+MCP corren en el mismo PID
        { name: "mcp", port: 5001 },
        { name: "mpt", port: 8080 },
      ];
      const results = await Promise.all(
        probes.map(async ({ name, port }) => {
          try {
            const out = await run(
              `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -EA SilentlyContinue | Select-Object -First 1).OwningProcess"`,
              4000
            );
            const pid = out.trim();
            if (!pid || pid === "0") return "";
            const info = await run(
              `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
              4000
            );
            const cmd = info.trim() || `PID ${pid}`;
            return `${name} -> ${cmd}`;
          } catch {
            return "";
          }
        })
      );
      native = results.filter(Boolean);
    }

    let mptOnline = false;
    let flaskOnline = false;
    let drafts = 0;
    try {
      mptOnline = (await fetch("http://127.0.0.1:8080/openapi.json", { signal: AbortSignal.timeout(3000) })).ok;
    } catch { /* MPT apagado */ }
    try {
      const r = await fetch(`${FLASK_BASE}/api/drafts`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(3000),
      });
      flaskOnline = r.ok;
      if (r.ok) {
        const list = await r.json();
        drafts = Array.isArray(list) ? list.length : 0;
      }
    } catch { /* Flask apagado */ }

    const body = {
      mode: containers.length > 0 ? "docker" : "native",
      containers,
      native,
      mpt_online: mptOnline,
      flask_online: flaskOnline,
      drafts,
    };
    stackCache = { at: Date.now(), body };
    res.json(body);
  });

  // 2. Accounts (solo admin: AUDIT-008)
  app.get("/api/accounts", (req, res) => flask(req, res, "GET", "/api/accounts"));
  app.post("/api/accounts", requireRole("admin"), (req, res) => flask(req, res, "POST", "/api/accounts", req.body));
  app.delete("/api/accounts/:id", requireRole("admin"), (req, res) => flask(req, res, "DELETE", `/api/accounts/${req.params.id}`));

  // Engagement bots (real -> inicia/detiene taktik-bot en Flask)
  app.post("/engagement/start", (req, res) => flask(req, res, "POST", "/engagement/start", req.body));
  app.post("/engagement/stop", (req, res) => flask(req, res, "POST", "/engagement/stop", req.body));

  // 3. Proxies (admin para mutaciones: AUDIT-008)
  app.get("/api/proxies", (req, res) => flask(req, res, "GET", "/api/proxies"));
  app.post("/api/proxies", requireRole("admin"), (req, res) => flask(req, res, "POST", "/api/proxies", req.body));
  app.delete("/api/proxies/:id", requireRole("admin"), (req, res) => flask(req, res, "DELETE", `/api/proxies/${req.params.id}`));
  app.post("/api/proxies/verify", (req, res) => flask(req, res, "POST", "/api/proxies/verify", req.body));

  // 4. Queue (cola real de Flask)
  app.get("/api/queue", (req, res) => flask(req, res, "GET", "/api/queue"));
  app.post("/api/queue", (req, res) => flask(req, res, "POST", "/api/queue", req.body));
  app.post("/api/queue/next", (req, res) => flask(req, res, "POST", "/api/queue/next", req.body));
  app.get("/api/drafts", (req, res) => flask(req, res, "GET", "/api/drafts"));
  app.post("/api/queue/:id/approve", (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/approve`, req.body));
  app.post("/api/queue/:id/publish", (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/publish`, req.body));
  app.post("/api/queue/:id/reject", (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/reject`, req.body));
  app.post("/api/queue/:id/schedule", (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/schedule`, req.body));
  app.delete("/api/queue/:id", requireRole("admin"), (req, res) => flask(req, res, "DELETE", `/api/queue/${req.params.id}`));

  // MP4 generados: el proxy genérico a Flask NO sirve binarios (parsea a JSON),
  // así que Express entrega el archivo directo desde platform/videos.
  app.get("/videos/:file", (req, res) => {
    const base = path.resolve(process.cwd(), "platform", "videos");
    const full = path.resolve(base, req.params.file);
    if (!full.startsWith(base + path.sep)) {
      return res.status(400).json({ error: "nombre de archivo inválido" });
    }
    if (!fs.existsSync(full)) {
      return res.status(404).json({ error: "vídeo no encontrado" });
    }
    res.sendFile(full);
  });

  // Login de Instagram (único, crea sessions/<id>.json)
  app.post("/api/accounts/:id/instagram/login", (req, res) =>
    flask(req, res, "POST", `/api/accounts/${req.params.id}/instagram/login`, req.body));

  // Credenciales del proxy: Flask no implementa /api/proxies/credentials (AUDIT §6).
  // Redirigimos a /api/proxies/verify, que sí persiste y verifica.
  app.post("/api/proxies/credentials", (req, res) =>
    flask(req, res, "POST", "/api/proxies/verify", req.body));
  app.post("/api/queue/from-preview", (req, res) => flask(req, res, "POST", "/api/queue/from-preview", req.body));
  app.post("/api/content/preview", (req, res) => flask(req, res, "POST", "/api/content/preview", req.body));
  app.get("/api/content/profiles", (req, res) => flask(req, res, "GET", "/api/content/profiles"));
  app.post("/api/content/profiles", (req, res) => flask(req, res, "POST", "/api/content/profiles", req.body));
  app.delete("/api/content/profiles/:id", (req, res) => flask(req, res, "DELETE", `/api/content/profiles/${req.params.id}`));

  // Código fuente real del backend (CodeViewer) — solo admin y desactivable (AUDIT-010).
  // EXPOSE_SOURCE=true lo habilita; por defecto responde 404 aunque Flask lo sirva.
  const exposeSource = process.env.EXPOSE_SOURCE === "true";
  app.get("/api/source", requireRole("admin"), (req, res, next) =>
    exposeSource ? flask(req, res, "GET", "/api/source") : next());
  app.get("/api/source/:file", requireRole("admin"), (req, res, next) =>
    exposeSource ? flask(req, res, "GET", `/api/source/${encodeURIComponent(req.params.file)}`) : next());

  // 5. MoneyPrinter status REAL (sin mock): salud de MPT + cola de Flask + config from .env.
  app.get("/api/moneyprinter/config", async (_req, res) => {
    let mptOnline = false;
    try { mptOnline = (await fetch("http://127.0.0.1:8080/openapi.json", { signal: AbortSignal.timeout(3000) })).ok; } catch { /* off */ }
    let flaskDrafts = 0;
    try {
      const r = await fetch(`${FLASK_BASE}/api/drafts`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) { const d = await r.json(); flaskDrafts = Array.isArray(d) ? d.length : 0; }
    } catch { /* off */ }

    // Config surfacada desde .env (fuente única) — no valores hardcodeados.
    const dotenvRaw = await import("fs/promises").then(m => m.readFile(path.join(process.cwd(), ".env"), "utf8")).catch(() => "");
    const env: Record<string, string> = {};
    for (const line of dotenvRaw.split(/\r?\n/)) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }

    res.json({
      status: mptOnline ? "online" : "offline",
      mpt_online: mptOnline,
      drafts: flaskDrafts,
      // Valores reales del sistema (legibles por UI del panel)
      mpt_api_url: env.MPT_API_URL || "http://127.0.0.1:8080",
      llm_provider: env.LLM_PROVIDER || "minimax",
      voice_name: env.MPT_VOICE_NAME || "es-ES-AlvaroNeural",
      video_aspect: env.MPT_VIDEO_ASPECT || "9:16",
      bgm_volume: Number(env.MPT_BGM_TYPE === "random" ? 0.2 : 0),
      subtitle_enabled: true,
      source: "real",
    });
  });

  // Guardar config = persistir en .env raíz (única fuente de verdad; BUGFIX:
  // este POST no existía y la UI recibía 404 al pulsar "Guardar").
  // Solo claves MPT_*/LLM_PROVIDER — nunca credenciales de sesión ni tokens.
  app.post("/api/moneyprinter/config", requireRole("admin"), async (req, res) => {
    const ALLOWED: Record<string, string> = {
      mpt_api_url: "MPT_API_URL",
      llm_provider: "LLM_PROVIDER",
      voice_name: "MPT_VOICE_NAME",
      video_aspect: "MPT_VIDEO_ASPECT",
      pexels_api_key: "PEXELS_API_KEY",
      minimax_api_key: "MINIMAX_API_KEY",
    };
    const envPath = path.join(process.cwd(), ".env");
    let raw = "";
    try { raw = await import("fs/promises").then((m) => m.readFile(envPath, "utf8")); } catch { /* crear */ }
    const lines = raw.split(/\r?\n/);
    const setKey = (k: string, v: string) => {
      const re = new RegExp(`^${k}=`);
      const line = `${k}=${v}`;
      const idx = lines.findIndex((l) => re.test(l));
      if (idx >= 0) lines[idx] = line; else lines.push(line);
    };
    let changed = 0;
    for (const [bodyKey, envKey] of Object.entries(ALLOWED)) {
      const v = req.body?.[bodyKey];
      if (typeof v === "string" && v.length > 0) { setKey(envKey, v); changed++; }
    }
    if (changed === 0) return res.status(400).json({ error: "Sin claves válidas para guardar." });
    await import("fs/promises").then((m) => m.writeFile(envPath, lines.join("\n"), "utf8"));
    res.json({ success: true, saved: changed, note: "Reinicia el stack para aplicar (.env se lee en arranque)." });
  });

  // Generar reel = crear job real en Flask (auto_approve=1 para E2E sin fricción).
  app.post("/api/moneyprinter/generate", (req, res) => {
    const body = { ...(req.body || {}), auto_approve: true };
    return flask(req, res, "POST", "/api/queue", body);
  });

  app.get("/api/moneyprinter/voices", async (_req, res) => {
    try {
      const voices = await runHostExec("edge-tts", ["--list-voices"], 8000);
      res.json({ voices: voices ? voices.split("\n").filter(Boolean) : [], source: "edge-tts" });
    } catch { res.json({ voices: [], source: "edge-tts", error: "edge-tts no disponible" }); }
  });

  app.post("/api/moneyprinter/test-pexels", async (req, res) => {
    const key = req.body?.pexels_api_key || process.env.PEXELS_API_KEY;
    if (!key) return res.json({ valid: false, message: "Sin PEXELS_API_KEY" });
    try {
      const r = await fetch("https://api.pexels.com/videos/popular?per_page=1", {
        headers: { Authorization: key },
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json();
      if (r.ok) return res.json({ valid: true, message: `Pexels OK (${data.total_results || 0}+ clips)`, total_results: data.total_results });
      return res.status(r.status).json({ valid: false, message: `Pexels HTTP ${r.status}` });
    } catch (err) {
      return res.status(503).json({ valid: false, message: `Pexels no alcanzable: ${err instanceof Error ? err.message : err}` });
    }
  });

  // 6. ADB Bridge (real: `adb devices -l` del host + salud de Flask)
  app.get("/api/adb/config", async (_req, res) => {
    let flaskOnline = false;
    try { flaskOnline = (await fetch(`${FLASK_BASE}/api/stats`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN }, signal: AbortSignal.timeout(3000) })).ok; } catch { /* off */ }
    res.json({
      mini_pc_ip: "127.0.0.1",
      mini_pc_port: 5000,
      adb_host: process.env.ADB_HOST || "127.0.0.1",
      adb_port: Number(process.env.ADB_PORT || 5037),
      use_real_flask: true,
      status: flaskOnline ? "connected_remote_flask" : "flask_offline",
    });
  });

  // Dispositivos ADB reales (proxy a Flask).
  // Flask ejecuta dumpsys/getprop por cada teléfono → tarda ~30s con 3+
  // dispositivos; el poll del panel pregunta cada 5s, así que cacheamos 5s
  // y damos 60s de margen (antes abortaba a 20s = "no reconoce nada").
  let adbDevicesCache: { at: number; body: unknown } | null = null;
  app.get("/api/adb/devices", async (_req, res) => {
    if (adbDevicesCache && Date.now() - adbDevicesCache.at < 5000) {
      return res.json(adbDevicesCache.body);
    }
    try {
      const r = await fetch(`${FLASK_BASE}/api/adb/devices`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(60000),
      });
      const body = await r.json();
      adbDevicesCache = { at: Date.now(), body };
      res.status(r.status).json(body);
    } catch (err) {
      res.status(503).json({ error: `Backend Flask no alcanzable en ${FLASK_BASE}/api/adb/devices`, detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Crear cuenta desde dispositivo ADB autorizado
  app.post("/api/accounts/from-device", (req, res) => flask(req, res, "POST", "/api/accounts/from-device", req.body));

  app.post("/api/adb/test-connection", async (req, res) => {
    const adbHost = req.body?.adb_host || process.env.ADB_HOST || "127.0.0.1";
    const miniPcIp = req.body?.mini_pc_ip || "127.0.0.1";
    const miniPcPort = Number(req.body?.mini_pc_port) || 5000;

    let flaskOnline = false;
    try { flaskOnline = (await fetch(`http://${miniPcIp}:${miniPcPort}/api/stats`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* off */ }

    const out = await runHostExec("adb", ["devices", "-l"], 8000);
    const devices = out
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("*") && l.includes("device "))
      .map((l) => l.split(/\s+/)[0]);

    res.json({
      success: true,
      flask_server_online: flaskOnline,
      adb_server_status: devices.length > 0 ? "online" : "no_devices",
      detected_devices: devices,
      config: { adb_host: adbHost, mini_pc_ip: miniPcIp, mini_pc_port: miniPcPort },
      message: `${devices.length} dispositivo(s) ADB detectados en el host`,
    });
  });

  // Visor de pantalla en tiempo real: lanza scrcpy del dispositivo (ventana nativa).
  // Solo admin; reutiliza el mismo adb daemon del host. SCRCPY_EXE en .env, si no en PATH.
  app.post("/api/adb/mirror", requireRole("admin"), (req, res) => {
    const serial = String(req.body?.serial || "").trim();
    if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return res.status(400).json({ error: "serial inválido" });
    }
    const scrcpy = process.env.SCRCPY_EXE || "scrcpy";
    try {
      // execFile desacoplado: lanzamos scrcpy y devolvemos inmediatamente (ventana nativa independiente).
      const child = execFile(
        scrcpy,
        ["-s", serial, "--window-title", `PhoneFarm - ${serial}`, "--max-fps", "30", "--video-bit-rate", "8M"],
        { windowsHide: true },
        (err) => { if (err) console.error("[scrcpy]", err.message); }
      );
      child.unref?.();
      return res.json({ success: true, message: `scrcpy lanzado para ${serial}`, serial });
    } catch (err) {
      return res.status(500).json({ error: `No se pudo lanzar scrcpy: ${err instanceof Error ? err.message : err}` });
    }
  });

  // --- Mirroring "Panda": screenshot live por screencap (grid en tiempo real) ---
  // GET /api/adb/screenshot/:serial -> PNG de la pantalla actual del teléfono.
  // La página /panda hace polling (<img> recargada) y muestra todas las pantallas a la vez.
  // Cache 900ms/serial: mismo adb daemon, sin saturar si hay varias pestañas abiertas.
  const shotCache = new Map<string, { at: number; buf: Buffer }>();
  app.get("/api/adb/screenshot/:serial", (req, res) => {
    const serial = String(req.params.serial || "").trim();
    if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return res.status(400).json({ error: "serial inválido" });
    }
    const now = Date.now();
    const hit = shotCache.get(serial);
    if (hit && now - hit.at < 900) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      return res.send(hit.buf);
    }
    execFile(
      process.env.ADB_EXE || "adb",
      ["-s", serial, "exec-out", "screencap", "-p"],
      { encoding: "buffer" as any, timeout: 8000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        const buf = stdout as unknown as Buffer;
        if (err || !buf || buf.length < 1000) {
          return res.status(503).json({ error: "screencap falló (dispositivo ocupado u offline)", serial });
        }
        shotCache.set(serial, { at: now, buf });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.send(buf);
      }
    );
  });

  // Control táctil (Panda interactivo): tap / swipe / key sobre el dispositivo.
  // POST /api/adb/touch { serial, action:"tap"|"swipe", x,y, x2?,y2?, dur? }
  // POST /api/adb/touch { serial, action:"key", key:"KEYCODE_BACK"|"KEYCODE_HOME"|3|...  }
  const TOUCH_ERR = (m: string) => ({ error: m });
  app.post("/api/adb/touch", (req, res) => {
    const serial = String(req.body?.serial || "").trim();
    if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return res.status(400).json(TOUCH_ERR("serial inválido"));
    }
    const action = String(req.body?.action || "tap");
    const adb = process.env.ADB_EXE || "adb";
    // Sin "shell": pasamos "input tap x y" como args separados. `input` en Android
    // imprime su usage a stdout y puede no hacer EOF limpio bajo `adb shell`,
    // lo que execFile marca como error de stream aunque el tap SÍ se ejecuta.
    // Por eso: (a) sin shell, (b) stdio ignorado, (c) cualquier output != error.
    const TOUCH_TIMEOUT = 90000; // 90 s: bajo carga del Mini PC un `input tap` puede tardar ~60 s.
    const run = (inputArgs: string[]) =>
      new Promise<void>((resolve, reject) => {
        // execFile (sin shell): args como array => sin inyección. `input` en Android
        // imprime usage a stderr y puede tardar; exit 137 = timeout, no fallo real.
        execFile(
          adb,
          ["-s", serial, ...inputArgs],
          { timeout: TOUCH_TIMEOUT, windowsHide: true, maxBuffer: 1024 * 1024 },
          (e, _stdout, stderr) => {
            const ecode = (e as any)?.code;
            if (ecode === 137 || (e && e.signal === "SIGTERM")) {
              console.warn(`[touch ${serial}] timeout tras ${TOUCH_TIMEOUT / 1000}s — ${inputArgs.join(" ")}`);
              return reject(new Error(`timeout tras ${TOUCH_TIMEOUT / 1000}s (daemon ADB saturado / dispositivo lento)`));
            }
            if (e && typeof ecode === "number" && ecode > 1) {
              console.warn(`[touch ${serial}] exit ${ecode}`, String(stderr || e.message).slice(0, 160));
              return reject(new Error(`adb exit ${ecode}: ${String(stderr || e.message).slice(0, 160)}`));
            }
            resolve();
          }
        ).on("error", (err) => reject(new Error(`adb no encontrado: ${err.message}`)));
      });
    (async () => {
      if (action === "tap") {
        const x = Math.round(Number(req.body?.x)), y = Math.round(Number(req.body?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return res.status(400).json(TOUCH_ERR("x/y inválidos"));
        await run(["shell", "input", "tap", String(x), String(y)]);
      } else if (action === "swipe") {
        const x = Math.round(Number(req.body?.x)), y = Math.round(Number(req.body?.y));
        const x2 = Math.round(Number(req.body?.x2)), y2 = Math.round(Number(req.body?.y2));
        const dur = Math.min(2000, Math.max(50, Math.round(Number(req.body?.dur) || 300)));
        if (![x, y, x2, y2].every(Number.isFinite)) return res.status(400).json(TOUCH_ERR("coordenadas inválidas"));
        await run(["shell", "input", "swipe", String(x), String(y), String(x2), String(y2), String(dur)]);
      } else if (action === "key") {
        let key = String(req.body?.key || "");
        const ALLOWED: Record<string, string> = { back: "KEYCODE_BACK", home: "KEYCODE_HOME", recent: "KEYCODE_APP_SWITCH", power: "KEYCODE_POWER", volup: "KEYCODE_VOLUME_UP", voldown: "KEYCODE_VOLUME_DOWN", enter: "KEYCODE_ENTER" };
        key = ALLOWED[key.toLowerCase()] || (/^KEYCODE_[A-Z0-9_]+$/.test(key) ? key : (/^\d+$/.test(key) ? key : ""));
        if (!key) return res.status(400).json(TOUCH_ERR("key inválida"));
        await run(["shell", "input", "keyevent", key]);
      } else {
        return res.status(400).json(TOUCH_ERR("action debe ser tap|swipe|key"));
      }
      res.json({ success: true, serial, action });
    })().catch((e) => res.status(500).json({ error: `input falló: ${e instanceof Error ? e.message : e}` }));
  });

  // 7. Logs (real: SSE proxy del /stream/logs de Flask)
  app.get("/api/logs", async (_req, res) => {
    try {
      const r = await fetch(`${FLASK_BASE}/api/stats`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN }, signal: AbortSignal.timeout(3000) });
      if (!r.ok) return res.status(503).json({ error: "Flask offline" });
      res.json({ logs: [], note: "los logs en vivo llegan por /api/stream/logs (SSE)" });
    } catch {
      res.status(503).json({ error: "Flask offline" });
    }
  });

  app.get("/api/stream/logs", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ message: "SSE proxy -> Flask /stream/logs (Phone Farm)" })}\n\n`);

    const abort = new AbortController();
    req.on("close", () => abort.abort());
    try {
      const upstream = await fetch(`${FLASK_BASE}/stream/logs`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: abort.signal,
      });
      if (!upstream.body) { res.end(); return; }
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
    } catch {
      res.end();
    }
  });

  // 8. Download ZIP (solo admin + redacción de campos sensibles: AUDIT-009)
  app.get("/api/download-zip", requireRole("admin"), async (_req, res) => {
    try {
      const [acc, prox, que] = await Promise.all([
        fetch(`${FLASK_BASE}/api/accounts`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
        fetch(`${FLASK_BASE}/api/proxies`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
        fetch(`${FLASK_BASE}/api/queue`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
      ]);
      // Redacción: no exportar seriales de dispositivo ni hosts de proxy al ZIP.
      const redact = (list: any[], fields: string[]) =>
        (Array.isArray(list) ? list : []).map((item) =>
          Object.fromEntries(Object.entries(item).map(([k, v]) => [k, fields.includes(k) ? "***" : v])));
      const zip = new JSZip();
      zip.file("accounts.json", JSON.stringify(redact(acc, ["device_serial", "session_file"]), null, 2));
      zip.file("proxies.json", JSON.stringify(redact(prox, ["host"]), null, 2));
      zip.file("queue.json", JSON.stringify(que, null, 2));
      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=phone-farm-config.zip");
      res.send(zipContent);
    } catch {
      res.status(503).json({ error: "Flask offline — no se pudo generar el ZIP" });
    }
  });

  // API desconocida -> 404 JSON (antes del fallback SPA)
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Ruta API no encontrada" });
  });

  // --- Vista standalone /panda: grid de pantallas en vivo (abrible en otra ventana) ---
  // Página ligera servida por Express (no React): polling <img> a /api/adb/screenshot/:serial.
  // Requiere sesión (requireAuth). 1 click desde el dashboard -> window.open('/panda').
  app.get("/panda", requireAuth, (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Panda — Pantallas en vivo</title>
<style>
:root{--bg:#17181A;--panel:#1E2023;--b:#2A2C30;--txt:#E5E5E5;--mut:#9CA1A8;--acc:#8A8F98;--ok:#6FBF73;--err:#E05B5B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:13px/1.4 ui-monospace,Consolas,monospace;padding:16px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
h1{font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0}
.badge{font-size:11px;color:var(--mut)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--b);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.card h2{font-size:12px;margin:0;color:var(--txt)}
.serial{font-size:10px;color:var(--mut)}
.meta{display:flex;justify-content:space-between;font-size:10px;color:var(--mut)}
.screen{width:100%;background:#000;border-radius:8px;aspect-ratio:9/16;object-fit:contain;border:1px solid var(--b)}
.off{opacity:.35;filter:grayscale(1)}
.row{display:flex;gap:8px;align-items:center}
button{background:var(--acc);border:none;color:#1E2023;font-weight:700;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit}
button.main{flex:1;background:var(--ok);color:#0E2A12;font-size:12px;padding:7px 8px}
button.main:hover{filter:brightness(1.12)}
button:hover{filter:brightness(1.1)}
.screen:active{outline:2px solid var(--acc)}
.msg{font-size:10px;color:var(--ok);min-height:12px}
.status{flex:1;text-align:right;font-size:10px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:4px}
</style>
</head>
<body>
<header>
  <h1>Panda · Pantallas en vivo</h1>
  <div class="badge"><span class="dot"></span><span id="count">…</span> dispositivos</div>
  <div class="row">
    <label class="badge">auto <input type="checkbox" id="auto" checked></label>
    <button class="ghost" id="refresh">Refrescar</button>
  </div>
</header>
<div class="grid" id="grid"></div>
<script>
const grid=document.getElementById('grid');
const countEl=document.getElementById('count');
const INTERVAL=1200;
let timers=[];
async function loadDevices(){
  try{
    const r=await fetch('/api/adb/devices');
    const d=await r.json();
    let list=d.devices||[];
    // Filtro ?solo=<serial>: abrir una ventana /panda centrada en un solo teléfono (desde el modal).
    const solo=new URLSearchParams(location.search).get('solo');
    if(solo) list=list.filter(x=>x.serial===solo);
    render(list);
  }catch(e){ grid.innerHTML='<div class="card">Error cargando dispositivos: '+e.message+'</div>'; }
}
function mirror(serial){
  const msg=document.getElementById('msg-'+serial);
  fetch('/api/adb/mirror',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serial})})
    .then(r=>r.json()).then(j=>{ msg.textContent = j.success? '✓ scrcpy abierto' : (j.error||'error'); })
    .catch(()=>{ msg.textContent='error de red'; });
  setTimeout(()=>{ msg.textContent=''; },4000);
}
function render(devs){
  countEl.textContent=devs.length;
  timers.forEach(clearInterval); timers=[];
  grid.innerHTML='';
  if(!devs.length){ grid.innerHTML='<div class="card">No hay teléfonos conectados por ADB.</div>'; return; }
  devs.forEach(dev=>{
    const card=document.createElement('div'); card.className='card';
    const auth = dev.status==='device';
    card.innerHTML=
      '<h2>'+(dev.model||dev.product||'Android')+'</h2>'+
      '<div class="serial">'+dev.serial+'</div>'+
      '<img class="screen" id="img-'+dev.serial+'" alt="pantalla"/>'+
      '<div class="meta"><span>bat '+(dev.battery_pct!=null?dev.battery_pct+'%':'—')+'</span><span>android '+(dev.android_version||'—')+'</span></div>'+
      '<div class="row"><button class="main" data-s="'+dev.serial+'" title="Abrir ventana nativa scrcpy: pantalla + control total del teléfono">Manejar (scrcpy)</button><span class="status" id="st-'+dev.serial+'"></span></div>'+
      '<div class="msg" id="msg-'+dev.serial+'"></div>';
    grid.appendChild(card);
    card.querySelector('button').addEventListener('click',()=>mirror(dev.serial));
    const img=card.querySelector('#img-'+dev.serial);
    const st =card.querySelector('#st-'+dev.serial);
    if(!auth){ img.classList.add('off'); st.textContent='sin autorizar'; return; }
    function snap(){
      fetch('/api/adb/screenshot/'+encodeURIComponent(dev.serial),{cache:'no-store'})
        .then(r=>{
          if(!r.ok){ st.textContent='offline'; img.classList.add('off'); return null; }
          return r.blob();
        })
        .then(b=>{
          if(!b) return;
          const url=URL.createObjectURL(b);
          img.onload=()=>URL.revokeObjectURL(url);
          img.src=url; img.classList.remove('off'); st.textContent='';
        })
        .catch(()=>{ st.textContent='offline'; img.classList.add('off'); });
    }
    snap();
    timers.push(setInterval(()=>{ if(document.getElementById('auto').checked) snap(); }, INTERVAL));
  });
}
document.getElementById('refresh').addEventListener('click',loadDevices);
loadDevices();
</script>
</body>
</html>`);
  });

  // Mount Vite Middleware in Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          // Ignorar el RUNTIME de la plataforma (queue.json, logs, MP4...):
          // Flask los escribe en cada transición de job y sin esto Vite
          // RECARGABA la página entera del operador en cada cambio de estado.
          ignored: [
            "**/platform/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/storage/**",
            "**/__pycache__/**",
            "**/*.log",
            "**/*.mp4",
          ],
        },
      },
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
    console.log(`Server Phone Farm running on http://localhost:${PORT} (proxy de API a ${FLASK_BASE})`);
  });
}

startServer();
