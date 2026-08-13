// ---------------------------------------------------------------------------
// App Express del panel Phone Farm. `createApp(config, deps)` construye la
// aplicación SIN abrir puertos (testable con supertest). El bootstrap real
// vive en server.ts; el estado de la plataforma en Flask (:5000).
// ---------------------------------------------------------------------------

import express from "express";
import path from "path";
import fs from "fs";
import { exec, execFile } from "child_process";
import JSZip from "jszip";
import { randomBytes } from "crypto";
import helmet from "helmet";
import type Database from "better-sqlite3";
import type { AppConfig } from "./config";
import { SessionStore, safeEqual, newSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SessionUser } from "./sessions";
import { verifyPassword } from "./passwords";
import { LoginRateLimiter } from "./rate-limit";
import { safeFetchInternal, guardInternalUrl, EgressError, INTERNAL_HOSTS } from "./net";
import { validate, loginSchema, queueCreateSchema, accountCreateSchema, proxyCreateSchema, mptSettingsSchema, adbTouchSchema, adbMirrorSchema } from "./schemas";

// --- Dependencias inyectables (tests) ---
export interface AppDeps {
  /** BD SQLite compartida con Flask (users/sessions/rate_limits). Obligatoria. */
  db: Database.Database;
  sessionStore?: SessionStore;
  /** Proxy a Flask: sustituible en tests para no abrir puertos. */
  flaskFetch?: (path: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>;
  /** execFile del host (adb/edge-tts): sustituible en tests. */
  hostExec?: (file: string, args: string[], timeout?: number) => Promise<string>;
  /** exec (shell) usado por /api/stack: sustituible en tests. */
  stackExec?: (cmd: string, timeout?: number) => Promise<string>;
  /** Middleware de Vite (dev). Si no se pasa y NODE_ENV!=production, no se monta. */
  viteMiddleware?: express.RequestHandler;
}

/** Límite de líneas del buffer de logs (paso 12). */
export const MAX_LOG_LINES = 64 * 1024;

export const CSRF_COOKIE = "pf_csrf";

export function createApp(config: AppConfig, deps: AppDeps): express.Express {
  if (!deps.db) {
    throw new Error("[FATAL] createApp requiere deps.db (BD SQLite compartida)");
  }
  const app = express();
  const store = deps.sessionStore ?? new SessionStore(deps.db);
  // Allowlist interna efectiva: loopback + hosts configurados de Flask/MPT.
  const internalHosts = new Set([...INTERNAL_HOSTS]);
  for (const u of [config.flaskBase, config.mptApiUrl]) {
    try { internalHosts.add(new URL(u).hostname.toLowerCase()); } catch { /* se valida al usarse */ }
  }
  const loginLimiter = new LoginRateLimiter(deps.db);
  const hostExec = deps.hostExec ?? ((file: string, args: string[], timeout = 8000) =>
    new Promise<string>((resolve) => {
      execFile(file, args, { timeout }, (err, stdout) => resolve(err ? "" : stdout));
    }));
  const stackExec = deps.stackExec ?? ((cmd: string, timeout = 4000) =>
    new Promise<string>((resolve) => {
      exec(cmd, { timeout }, (err, stdout) => resolve(err ? "" : stdout));
    }));

  app.disable("x-powered-by");
  // Tailscale Serve / reverse proxy TLS conectan desde loopback: confiar solo
  // en proxies de loopback para X-Forwarded-* (nunca XFF arbitrario).
  app.set("trust proxy", "loopback");

  // Correlación de requests: X-Request-ID generado y propagado a Flask (paso 6).
  app.use((req, res, next) => {
    const rid = (typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"]) || randomBytes(16).toString("hex");
    (req as any).requestId = rid;
    res.setHeader("X-Request-ID", rid);
    next();
  });

  /** Notifica a Flask un evento de auditoría de auth (fire-and-forget, paso 6). */
  function notifyAudit(actor: string, role: string, action: string, object?: string, meta?: unknown, requestId?: string) {
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Auth": INTERNAL_TOKEN,
      "X-Request-ID": requestId || "",
    };
    const body = JSON.stringify({ actor, role, action, object, meta, request_id: requestId });
    const call = async () => {
      if (deps.flaskFetch) {
        await deps.flaskFetch(`${config.flaskBase}/internal/audit`, {
          method: "POST", headers, body, signal: AbortSignal.timeout(5000),
        });
      } else {
        await fetch(`${config.flaskBase}/internal/audit`, {
          method: "POST", headers, body, signal: AbortSignal.timeout(5000),
        });
      }
    };
    call().catch(() => {
      /* auditoría best-effort: no debe romper el login si Flask está caído */
      console.warn("[audit] Flask no disponible para registrar", action);
    });
  }

  // Nonce CSP por request (para /panda, cuya página usa <script> inline).
  app.use((req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString("base64");
    next();
  });

  const behindHttps = config.publicBaseUrl.startsWith("https://");
  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === "production" ? {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", (req, res) => `'nonce-${(res as any).locals.cspNonce}'`],
        "style-src": ["'self'", "'unsafe-inline'"], // estilos inline del código existente
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        // upgrade-insecure-requests solo tras TLS: en loopback rompería la UI.
        "upgrade-insecure-requests": behindHttps ? [] : null,
      },
    } : false,
    // HSTS solo cuando el acceso público es HTTPS (Tailscale Serve).
    strictTransportSecurity: behindHttps ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: "no-referrer" },
  }));

  app.use(express.json({ limit: "256kb" }));

  // --- Helpers de autenticación ---

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
    const user = store.get(getToken(req));
    if (user) {
      (req as any).user = user;
      return next();
    }
    res.status(401).json({ error: "No autorizado. Inicia sesión primero." });
  }

  /** RBAC: solo admin. Requiere requireAuth previo. */
  function requireRole(role: "admin") {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = (req as any).user as SessionUser | undefined;
      if (user && user.role === role) return next();
      res.status(403).json({ error: `Requiere rol ${role}.` });
    };
  }

  // Limpieza periódica de sesiones y rate limits expirados (cada 10 min).
  const cleanupTimer = setInterval(() => {
    store.cleanup();
    loginLimiter.cleanup();
  }, 10 * 60 * 1000);
  cleanupTimer.unref();

  // --- Proxy a Flask (auth interno entre servicios) ---

  const INTERNAL_TOKEN = config.internalToken;

  async function flask(
    _req: express.Request,
    res: express.Response,
    method: "GET" | "POST" | "DELETE" | "PATCH",
    flaskPath: string,
    jsonBody?: unknown,
    timeoutMs = 20000,
  ) {
    // Identidad del actor propagada a Flask (paso 5/6): solo la inyecta el
    // proxy Express; Flask la acepta únicamente desde loopback con token válido.
    const user = (_req as any).user as SessionUser | undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
      "X-Internal-Auth": INTERNAL_TOKEN,
      "X-Request-ID": (_req as any).requestId || "",
    };
    if (user) {
      headers["X-Actor"] = user.username;
      headers["X-Role"] = user.role;
    }
    try {
      // SSRF (paso 9): solo destinos internos de la allowlist (loopback+config).
      guardInternalUrl(`${config.flaskBase}${flaskPath}`, internalHosts);
      const r = await (deps.flaskFetch ?? defaultFlaskFetch)(
        `${config.flaskBase}${flaskPath}`,
        {
          method,
          headers,
          body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
      const text = await r.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      res.status(r.status).json(data);
    } catch (err) {
      res.status(503).json({
        error: `Backend Flask no alcanzable en ${config.flaskBase}${flaskPath}`,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --- AUTH (local al panel) ---

  const cookieAttrs = `HttpOnly; Path=/; SameSite=Strict; ${config.cookieSecure ? "Secure; " : ""}`;
  // Cookie CSRF de doble envío: legible por JS (no HttpOnly) pero SameSite=Strict.
  const csrfCookieAttrs = `Path=/; SameSite=Strict; ${config.cookieSecure ? "Secure; " : ""}`;

  /**
   * Protección CSRF para mutaciones: (a) comprobación de Origin/Referer contra
   * allowlist y (b) token de doble envío (header X-CSRF-Token == cookie pf_csrf).
   * Login queda exento (es quien crea la cookie CSRF).
   */
  function csrfProtect(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.path === "/api/auth/login") return next();

    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      let originHost: string;
      try { originHost = new URL(origin).origin; } catch {
        return res.status(403).json({ error: "Origen no permitido." });
      }
      const allowed = new Set([
        new URL(config.publicBaseUrl).origin,
        `http://127.0.0.1:${config.port}`,
        `http://localhost:${config.port}`,
      ]);
      if (!allowed.has(originHost)) {
        return res.status(403).json({ error: "Origen no permitido." });
      }
    }

    const header = req.headers["x-csrf-token"];
    const cookie = parseCookies(req)[CSRF_COOKIE];
    if (typeof header !== "string" || !cookie || !safeEqual(header, cookie)) {
      return res.status(403).json({ error: "Token CSRF inválido o ausente." });
    }
    next();
  }

  // Login contra la tabla users (scrypt) con rate limit persistente por
  // usuario+IP (5/15min) y por IP (20/15min). Sin credenciales de .env.
  app.post("/api/auth/login", validate(loginSchema), (req, res) => {
    const { username, password } = req.body || {};
    const u = typeof username === "string" ? username : "";
    const p = typeof password === "string" ? password : "";
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const requestId = (req as any).requestId as string;

    const limit = loginLimiter.check(u, ip);
    if (!limit.ok) {
      notifyAudit(u, "unknown", "auth.login_blocked", undefined, { ip }, requestId);
      return res.status(429).json({ error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s.` });
    }

    const userRow = deps.db
      .prepare("SELECT id, username, role, password_hash FROM users WHERE username = ?")
      .get(u) as { id: string; username: string; role: "admin" | "operator"; password_hash: string } | undefined;

    if (!userRow || !verifyPassword(p, userRow.password_hash)) {
      loginLimiter.recordFailure(u, ip);
      notifyAudit(u, "unknown", "auth.login_failed", undefined, { ip }, requestId);
      return res.status(401).json({ error: "Credenciales inválidas." });
    }
    loginLimiter.recordSuccess(u, ip);

    const token = newSessionToken();
    const user: SessionUser = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      email: `${userRow.username}@phonefarm.local`,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };
    store.set(token, user); // un token por login; persistido en SQLite
    notifyAudit(user.username, user.role, "auth.login", undefined, { ip }, requestId);
    res.setHeader("Set-Cookie", [
      `${SESSION_COOKIE}=${token}; ${cookieAttrs}Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      `${CSRF_COOKIE}=${randomBytes(18).toString("hex")}; ${csrfCookieAttrs}Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ]);
    // Nunca devolver el token en el body (va solo en cookie HttpOnly).
    return res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  });

  // Logout exige sesión y solo revoca LA sesión actual (no todas).
  app.post("/api/auth/logout", requireAuth, csrfProtect, (req, res) => {
    const user = (req as any).user as SessionUser;
    store.delete(getToken(req));
    notifyAudit(user.username, user.role, "auth.logout");
    res.setHeader("Set-Cookie", [
      `${SESSION_COOKIE}=; ${cookieAttrs}Max-Age=0`,
      `${CSRF_COOKIE}=; ${csrfCookieAttrs}Max-Age=0`,
    ]);
    res.json({ success: true, message: "Sesión cerrada correctamente" });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = store.get(getToken(req));
    if (user) {
      res.json({ authenticated: true, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
    } else {
      res.json({ authenticated: false, user: null });
    }
  });

  // --- API protegida (requiere sesión del panel + CSRF en mutaciones) ---
  app.use("/api", requireAuth, csrfProtect);
  app.use("/engagement", requireAuth, csrfProtect);
  app.use("/videos", requireAuth);

  // 1. Stats (real, desde Flask)
  app.get("/api/stats", (req, res) => flask(req, res, "GET", "/api/stats"));

  // 0.5 Stack: contenedores Docker O procesos nativos de la farm (solo lectura).
  let stackCache: { at: number; body: unknown } | null = null;
  app.get("/api/stack", async (req, res) => {
    if (stackCache && Date.now() - stackCache.at < 10_000) {
      return res.json(stackCache.body);
    }
    const run = (cmd: string, timeout = 4000) => stackExec(cmd, timeout);
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

    let native: string[] = [];
    if (containers.length === 0) {
      const probes: { name: string; port: number }[] = [
        { name: "platform", port: 5000 },
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
      mptOnline = (await fetch(config.mptApiUrl + "/ping", { signal: AbortSignal.timeout(3000) })).ok;
    } catch { /* MPT apagado */ }
    try {
      const r = await fetch(`${config.flaskBase}/api/drafts`, {
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

  // 2. Accounts (solo admin para mutaciones)
  app.get("/api/accounts", (req, res) => flask(req, res, "GET", "/api/accounts"));
  app.post("/api/accounts", requireRole("admin"), validate(accountCreateSchema), (req, res) => flask(req, res, "POST", "/api/accounts", req.body));
  app.delete("/api/accounts/:id", requireRole("admin"), (req, res) => flask(req, res, "DELETE", `/api/accounts/${req.params.id}`));

  // Engagement bots (real -> inicia/detiene taktik-bot en Flask) — SOLO admin
  app.post("/engagement/start", requireRole("admin"), (req, res) => flask(req, res, "POST", "/engagement/start", req.body));
  app.post("/engagement/stop", requireRole("admin"), (req, res) => flask(req, res, "POST", "/engagement/stop", req.body));

  // 3. Proxies (admin para mutaciones)
  app.get("/api/proxies", (req, res) => flask(req, res, "GET", "/api/proxies"));
  app.post("/api/proxies", requireRole("admin"), validate(proxyCreateSchema), (req, res) => flask(req, res, "POST", "/api/proxies", req.body));
  app.delete("/api/proxies/:id", requireRole("admin"), (req, res) => flask(req, res, "DELETE", `/api/proxies/${req.params.id}`));
  app.post("/api/proxies/verify", (req, res) => flask(req, res, "POST", "/api/proxies/verify", req.body));

  // 4. Queue (cola real de Flask)
  // RBAC (paso 5): operator consulta/crea borradores y marca "listo";
  // admin aprueba, publica, programa, rechaza y elimina.
  app.get("/api/queue", (req, res) => flask(req, res, "GET", "/api/queue"));
  app.post("/api/queue", validate(queueCreateSchema), (req, res) => flask(req, res, "POST", "/api/queue", req.body));
  app.post("/api/queue/next", (req, res) => flask(req, res, "POST", "/api/queue/next", req.body));
  app.get("/api/drafts", (req, res) => flask(req, res, "GET", "/api/drafts"));
  app.post("/api/queue/:id/ready", (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/ready`, req.body));
  app.post("/api/queue/:id/approve", requireRole("admin"), (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/approve`, req.body));
  app.post("/api/queue/:id/publish", requireRole("admin"), (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/publish`, req.body));
  app.post("/api/queue/:id/reject", requireRole("admin"), (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/reject`, req.body));
  app.post("/api/queue/:id/schedule", requireRole("admin"), (req, res) => flask(req, res, "POST", `/api/queue/${req.params.id}/schedule`, req.body));
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

  // Login de Instagram (único; SOLO admin — paso 5). La identidad de la cuenta
  // viene de :id; Flask ignora el username del cliente (paso 8).
  app.post("/api/accounts/:id/instagram/login", requireRole("admin"), (req, res) =>
    flask(req, res, "POST", `/api/accounts/${req.params.id}/instagram/login`, req.body));

  // Credenciales del proxy: Flask no implementa /api/proxies/credentials.
  // Redirigimos a /api/proxies/verify, que sí persiste y verifica.
  app.post("/api/proxies/credentials", requireRole("admin"), (req, res) =>
    flask(req, res, "POST", "/api/proxies/verify", req.body));
  app.post("/api/queue/from-preview", (req, res) => flask(req, res, "POST", "/api/queue/from-preview", req.body));
  app.post("/api/content/preview", (req, res) => flask(req, res, "POST", "/api/content/preview", req.body));
  app.get("/api/content/profiles", (req, res) => flask(req, res, "GET", "/api/content/profiles"));
  app.post("/api/content/profiles", (req, res) => flask(req, res, "POST", "/api/content/profiles", req.body));
  app.delete("/api/content/profiles/:id", (req, res) => flask(req, res, "DELETE", `/api/content/profiles/${req.params.id}`));

  // Código fuente real del backend (CodeViewer) — solo admin y desactivable.
  // EXPOSE_SOURCE=true lo habilita; por defecto responde 404 aunque Flask lo sirva.
  app.get("/api/source", requireRole("admin"), (req, res, next) =>
    config.exposeSource ? flask(req, res, "GET", "/api/source") : next());
  app.get("/api/source/:file", requireRole("admin"), (req, res, next) =>
    config.exposeSource ? flask(req, res, "GET", `/api/source/${encodeURIComponent(req.params.file)}`) : next());

  // 5. MoneyPrinter status REAL (sin mock): salud de MPT + cola de Flask + config from .env.
  app.get("/api/moneyprinter/config", async (_req, res) => {
    let mptOnline = false;
    try { mptOnline = (await fetch(`${config.mptApiUrl}/openapi.json`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* off */ }
    let flaskDrafts = 0;
    try {
      const r = await fetch(`${config.flaskBase}/api/drafts`, {
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
      mpt_api_url: env.MPT_API_URL || config.mptApiUrl,
      llm_provider: env.LLM_PROVIDER || config.llmProvider,
      voice_name: env.MPT_VOICE_NAME || config.mptVoiceName,
      video_aspect: env.MPT_VIDEO_ASPECT || config.mptVideoAspect,
      bgm_volume: Number(env.MPT_BGM_TYPE === "random" ? 0.2 : 0),
      subtitle_enabled: true,
      source: "real",
    });
  });

  // Guardar config (paso 9): tabla `settings` validada; NUNCA se escribe .env
  // desde HTTP (PF-SEC-018). Los secretos (pexels/minimax) no se aceptan.
  app.post("/api/moneyprinter/config", requireRole("admin"), validate(mptSettingsSchema), async (req, res) => {
    try {
      const allowed = ["mpt_api_url", "llm_provider", "voice_name", "video_aspect"];
      const upsert = deps.db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')"
      );
      let changed = 0;
      const body = req.body || {};
      for (const key of allowed) {
        const v = body[key];
        if (typeof v === "string" && v.length > 0) {
          if (key === "mpt_api_url") guardInternalUrl(v); // solo hosts internos
          upsert.run(key, v);
          changed++;
        }
      }
      if (changed === 0) return res.status(400).json({ error: "Sin claves válidas para guardar." });
      res.json({ success: true, saved: changed, note: "Aplica al reiniciar/regenerar config (nunca se edita .env)." });
    } catch (err) {
      res.status(500).json({ error: "no se pudo guardar la configuración", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Generar reel = crear job real en Flask (solo admin). Sin auto_approve:
  // el job pasa SIEMPRE por aprobación humana (paso 5).
  app.post("/api/moneyprinter/generate", requireRole("admin"), (req, res) => {
    const { auto_approve: _removed, ...body } = req.body || {};
    return flask(req, res, "POST", "/api/queue", body);
  });

  app.get("/api/moneyprinter/voices", async (_req, res) => {
    try {
      const voices = await hostExec("edge-tts", ["--list-voices"], 8000);
      res.json({ voices: voices ? voices.split("\n").filter(Boolean) : [], source: "edge-tts" });
    } catch { res.json({ voices: [], source: "edge-tts", error: "edge-tts no disponible" }); }
  });

  app.post("/api/moneyprinter/test-pexels", async (req, res) => {
    const key = req.body?.pexels_api_key || config.pexelsApiKey;
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
    try { flaskOnline = (await fetch(`${config.flaskBase}/api/stats`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN }, signal: AbortSignal.timeout(3000) })).ok; } catch { /* off */ }
    res.json({
      mini_pc_ip: "127.0.0.1",
      mini_pc_port: 5000,
      adb_host: config.adbHost,
      adb_port: config.adbPort,
      use_real_flask: true,
      status: flaskOnline ? "connected_remote_flask" : "flask_offline",
    });
  });

  // Dispositivos ADB reales (proxy a Flask). Cache 5s (ver nota original).
  let adbDevicesCache: { at: number; body: unknown } | null = null;
  app.get("/api/adb/devices", async (_req, res) => {
    if (adbDevicesCache && Date.now() - adbDevicesCache.at < 5000) {
      return res.json(adbDevicesCache.body);
    }
    try {
      const r = await fetch(`${config.flaskBase}/api/adb/devices`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(60000),
      });
      const body = await r.json();
      adbDevicesCache = { at: Date.now(), body };
      res.status(r.status).json(body);
    } catch (err) {
      res.status(503).json({ error: `Backend Flask no alcanzable en ${config.flaskBase}/api/adb/devices`, detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Crear cuenta desde dispositivo ADB autorizado (solo admin)
  app.post("/api/accounts/from-device", requireRole("admin"), (req, res) => flask(req, res, "POST", "/api/accounts/from-device", req.body));

  // (Paso 9: sin host/puerto del cliente — SSRF. Usa ADB_HOST/ADB_PORT del
  // servidor, validados al arrancar, y el token interno al destino.)
  app.post("/api/adb/test-connection", async (req, res) => {
    const adbHost = config.adbHost;
    const miniPcIp = "127.0.0.1";
    const miniPcPort = config.flaskBase ? new URL(config.flaskBase).port || 5000 : 5000;

    let flaskOnline = false;
    try {
      const r = await fetch(`${config.flaskBase}/api/stats`, {
        headers: { "X-Internal-Auth": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(3000),
      });
      flaskOnline = r.ok;
    } catch { /* off */ }

    const out = await hostExec("adb", ["devices", "-l"], 8000);
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
  app.post("/api/adb/mirror", requireRole("admin"), validate(adbMirrorSchema), (req, res) => {
    const serial = String(req.body?.serial || "").trim();
    if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return res.status(400).json({ error: "serial inválido" });
    }
    try {
      const child = execFile(
        config.scrcpyExe,
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
      config.adbExe,
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
  const TOUCH_ERR = (m: string) => ({ error: m });
  app.post("/api/adb/touch", validate(adbTouchSchema), (req, res) => {
    const serial = String(req.body?.serial || "").trim();
    if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return res.status(400).json(TOUCH_ERR("serial inválido"));
    }
    const action = String(req.body?.action || "tap");
    // execFile (sin shell): args como array => sin inyección.
    const TOUCH_TIMEOUT = 90000;
    const run = (inputArgs: string[]) =>
      new Promise<void>((resolve, reject) => {
        execFile(
          config.adbExe,
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
      const r = await fetch(`${config.flaskBase}/api/stats`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN }, signal: AbortSignal.timeout(3000) });
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
      const upstream = await fetch(`${config.flaskBase}/stream/logs`, {
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

  // 8. Download ZIP (solo admin + redacción de campos sensibles)
  app.get("/api/download-zip", requireRole("admin"), async (_req, res) => {
    try {
      const [acc, prox, que] = await Promise.all([
        fetch(`${config.flaskBase}/api/accounts`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
        fetch(`${config.flaskBase}/api/proxies`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
        fetch(`${config.flaskBase}/api/queue`, { headers: { "X-Internal-Auth": INTERNAL_TOKEN } }).then((r) => r.ok ? r.json() : []),
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

  // --- Vista standalone /panda: grid de pantallas en vivo ---
  // Requiere sesión (requireAuth). Los datos ADB se renderizan con nodos DOM
  // y textContent (paso 10), nunca innerHTML.
  app.get("/panda", requireAuth, (_req, res) => {
    const nonce = res.locals.cspNonce;
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
<script nonce="${nonce}">
const grid=document.getElementById('grid');
const countEl=document.getElementById('count');
const INTERVAL=1200;
let timers=[];
function getCookie(name){const m=document.cookie.match(new RegExp('(?:^|; )'+name+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
async function loadDevices(){
  try{
    const r=await fetch('/api/adb/devices');
    const d=await r.json();
    let list=d.devices||[];
    const solo=new URLSearchParams(location.search).get('solo');
    if(solo) list=list.filter(x=>x.serial===solo);
    render(list);
  }catch(e){ grid.textContent='Error cargando dispositivos: '+(e&&e.message?e.message:e); }
}
function mirror(serial){
  const msg=document.getElementById('msg-'+serial);
  fetch('/api/adb/mirror',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':getCookie('pf_csrf')},body:JSON.stringify({serial})})
    .then(r=>r.json()).then(j=>{ msg.textContent = j.success? '✓ scrcpy abierto' : (j.error||'error'); })
    .catch(()=>{ msg.textContent='error de red'; });
  setTimeout(()=>{ msg.textContent=''; },4000);
}
function render(devs){
  countEl.textContent=devs.length;
  timers.forEach(clearInterval); timers=[];
  grid.textContent='';
  if(!devs.length){ grid.appendChild(el('div','card','No hay teléfonos conectados por ADB.')); return; }
  devs.forEach(dev=>{
    const card=el('div','card');
    const title=el('h2',null,dev.model||dev.product||'Android');
    const serialEl=el('div','serial',dev.serial);
    const img=el('img','screen'); img.id='img-'+dev.serial; img.alt='pantalla';
    const meta=el('div','meta');
    meta.appendChild(el('span',null,'bat '+(dev.battery_pct!=null?dev.battery_pct+'%':'—')));
    meta.appendChild(el('span',null,'android '+(dev.android_version||'—')));
    const row=el('div','row');
    const btn=el('button','main','Manejar (scrcpy)'); btn.dataset.s=dev.serial; btn.title='Abrir ventana nativa scrcpy';
    const st=el('span','status'); st.id='st-'+dev.serial;
    row.appendChild(btn); row.appendChild(st);
    const msg=el('div','msg'); msg.id='msg-'+dev.serial;
    card.appendChild(title); card.appendChild(serialEl); card.appendChild(img);
    card.appendChild(meta); card.appendChild(row); card.appendChild(msg);
    grid.appendChild(card);
    btn.addEventListener('click',()=>mirror(dev.serial));
    const auth = dev.status==='device';
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

  // --- Frontend ---
  if (deps.viteMiddleware) {
    app.use(deps.viteMiddleware);
  } else if (config.nodeEnv === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

/** Cliente HTTP por defecto hacia Flask (loopback + token interno). */
async function defaultFlaskFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
): Promise<{ status: number; text: () => Promise<string> }> {
  const r = await fetch(url, init as RequestInit);
  return { status: r.status, text: () => r.text() };
}
