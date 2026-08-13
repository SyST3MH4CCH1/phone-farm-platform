import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp, CSRF_COOKIE } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW, TEST_OPERATOR_PW } from "./helpers";
import { SESSION_COOKIE } from "../server/sessions";

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
}

/** Login y devuelve {sessionCookie, csrfCookie, csrfToken}. */
async function login(app: Express, username: string, password: string) {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  const cookies = setCookies(res);
  const sessionCookie = cookies.find((c) => c.startsWith("pf_session="))!.split(";")[0];
  const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`))!.split(";")[0];
  return { sessionCookie, csrfCookie, csrf: csrfCookie.split("=")[1] };
}

function auth(headers: { sessionCookie: string; csrfCookie: string; csrf: string }) {
  return (req: request.Test) =>
    req
      .set("Cookie", `${headers.sessionCookie}; ${headers.csrfCookie}`)
      .set("X-CSRF-Token", headers.csrf);
}

describe("paso 5 — sesiones persistentes", () => {
  it("la sesión sobrevive a un 'reinicio' (nueva app con la misma BD)", async () => {
    const db = seedDb();
    const app1 = createApp(testConfig(), { db });
    const app2 = createApp(testConfig(), { db });
    const s = await login(app1, "admin", TEST_ADMIN_PW);

    // app2 (proceso "reiniciado") reconoce el token sin volver a loguear
    const res = await request(app2).get("/api/auth/me").set("Cookie", s.sessionCookie);
    expect(res.body).toMatchObject({ authenticated: true, user: { username: "admin", role: "admin" } });
  });

  it("logout revoca SOLO la sesión actual (otra sesión sigue viva)", async () => {
    const db = seedDb();
    const app = createApp(testConfig(), { db });
    const s1 = await login(app, "admin", TEST_ADMIN_PW);
    const s2 = await login(app, "admin", TEST_ADMIN_PW);

    const out = await auth(s1)(request(app).post("/api/auth/logout"));
    expect(out.status).toBe(200);

    const me1 = await request(app).get("/api/auth/me").set("Cookie", s1.sessionCookie);
    const me2 = await request(app).get("/api/auth/me").set("Cookie", s2.sessionCookie);
    expect(me1.body.authenticated).toBe(false);
    expect(me2.body.authenticated).toBe(true);
  });
});

describe("paso 5 — rate limit de login persistente", () => {
  it("5 fallos por usuario+IP → 429; con credenciales correctas no se cuenta", async () => {
    const app = createApp(testConfig(), { db: seedDb() });
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "mala-password" });
      expect(res.status).toBe(401);
    }
    // sexto intento fallido: bloqueado
    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "mala-password" });
    expect(blocked.status).toBe(429);
    // incluso con la contraseña correcta, el usuario+IP está bloqueado
    const correct = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    expect(correct.status).toBe(429);
  });
});

describe("paso 5 — RBAC admin/operator", () => {
  let app: Express;
  let admin: { sessionCookie: string; csrfCookie: string; csrf: string };
  let operator: { sessionCookie: string; csrfCookie: string; csrf: string };

  beforeAll(async () => {
    app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async () => ({ status: 200, text: async () => JSON.stringify({ ok: true }) }),
    });
    admin = await login(app, "admin", TEST_ADMIN_PW);
    operator = await login(app, "operator", TEST_OPERATOR_PW);
  });

  const mut = (path: string, body: object, who: { sessionCookie: string; csrfCookie: string; csrf: string }) =>
    auth(who)(request(app).post(path)).send(body);

  it("operator NO puede publicar/aprobar/programar/engagement/credenciales (403)", async () => {
    for (const path of [
      "/api/queue/job_1/publish",
      "/api/queue/job_1/approve",
      "/api/queue/job_1/schedule",
      "/api/queue/job_1/reject",
      "/api/accounts/acc_1/instagram/login",
      "/api/accounts/from-device",
      "/api/moneyprinter/generate",
      "/engagement/start",
      "/api/proxies/credentials",
    ]) {
      const res = await mut(path, {}, operator);
      expect(res.status).toBe(403);
    }
  });

  it("operator SÍ puede crear borradores (POST /api/queue) y marcar ready", async () => {
    const create = await mut("/api/queue", { keyword: "test" }, operator);
    expect(create.status).toBe(200); // proxy mock ok
    const ready = await mut("/api/queue/job_1/ready", {}, operator);
    expect(ready.status).toBe(200);
  });

  it("admin puede publicar", async () => {
    const res = await mut("/api/queue/job_1/publish", {}, admin);
    expect(res.status).toBe(200);
  });

  it("moneyprinter/generate NO fuerza auto_approve", async () => {
    let seenBody: unknown = null;
    const app2 = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async (_url, init) => {
        seenBody = init.body;
        return { status: 201, text: async () => JSON.stringify({ ok: true }) };
      },
    });
    const a = await login(app2, "admin", TEST_ADMIN_PW);
    const res = await auth(a)(request(app2).post("/api/moneyprinter/generate")).send({ keyword: "x" });
    expect(res.status).toBe(201);
    const body = JSON.parse(seenBody as string);
    expect(body.auto_approve).toBeUndefined();
  });
});

describe("paso 6 — identidad y auditoría de auth", () => {
  it("login notifica a Flask /internal/audit y se propaga X-Request-ID", async () => {
    const auditCalls: { url: string; actor?: string; action?: string }[] = [];
    const app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async (url, init) => {
        const parsed = JSON.parse(init.body || "{}");
        if (url.includes("/internal/audit")) {
          auditCalls.push({ url, actor: parsed.actor, action: parsed.action });
          return { status: 200, text: async () => JSON.stringify({ ok: true }) };
        }
        return { status: 200, text: async () => JSON.stringify({ ok: true }) };
      },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    // esperar la notificación fire-and-forget
    await new Promise((r) => setTimeout(r, 50));
    expect(auditCalls.some((c) => c.action === "auth.login" && c.actor === "admin")).toBe(true);
  });
});

describe("paso 9 — validación, SSRF y configuración segura", () => {
  it("login con caracteres de control → 400", async () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin\r\nX=1", password: TEST_ADMIN_PW });
    expect(res.status).toBe(400);
  });

  it("adb/test-connection ignora host/puerto del cliente (anti-SSRF)", async () => {
    const app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async () => ({ status: 200, text: async () => JSON.stringify({ ok: true }) }),
      hostExec: async () => "List of devices attached\nSERIAL123\tdevice product:x model:y\n",
    });
    const a = await login(app, "admin", TEST_ADMIN_PW);
    const res = await auth(a)(request(app).post("/api/adb/test-connection"))
      .send({ mini_pc_ip: "169.254.169.254", mini_pc_port: 8080, adb_host: "evil.example" });
    expect(res.status).toBe(200);
    // la config devuelta SIEMPRE es la del servidor
    expect(res.body.config).toMatchObject({ adb_host: "127.0.0.1", mini_pc_ip: "127.0.0.1" });
  });

  it("moneyprinter/config rechaza secretos y valores con '=' o saltos de línea", async () => {
    const db = seedDb();
    const app = createApp(testConfig(), { db });
    const a = await login(app, "admin", TEST_ADMIN_PW);

    const secret = await auth(a)(request(app).post("/api/moneyprinter/config"))
      .send({ pexels_api_key: "sk-secreto" });
    expect(secret.status).toBe(400);

    const injection = await auth(a)(request(app).post("/api/moneyprinter/config"))
      .send({ voice_name: "voz\nADMIN_PASSWORD=hacked" });
    expect(injection.status).toBe(400);

    // valor válido → se guarda en settings (nunca en .env)
    const ok = await auth(a)(request(app).post("/api/moneyprinter/config"))
      .send({ voice_name: "es-ES-PacoNeural" });
    expect(ok.status).toBe(200);
    const row = db.prepare("SELECT value FROM settings WHERE key='voice_name'").get() as { value: string };
    expect(row.value).toBe("es-ES-PacoNeural");
  });
});

describe("paso 10 — backup cifrado con reautenticación", () => {
  it("export sin password válido → 403 (reautenticación)", async () => {
    const app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async () => ({ status: 200, text: async () => JSON.stringify({ ok: true }) }),
    });
    const a = await login(app, "admin", TEST_ADMIN_PW);
    const res = await auth(a)(request(app).post("/api/backups/export"))
      .send({ passphrase: "frase-larga-123456", password: "password-incorrecta" });
    expect(res.status).toBe(403);
  });

  it("export con reauth correcta → envelope .pfbackup cifrado (sin datos en claro)", async () => {
    const payload = { accounts: [{ id: "acc_1", username: "u1", password: "pass-secreto-1" }] };
    const app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async () => ({ status: 200, text: async () => JSON.stringify(payload) }),
    });
    const a = await login(app, "admin", TEST_ADMIN_PW);
    const res = await auth(a)(request(app).post("/api/backups/export"))
      .send({ passphrase: "frase-larga-123456", password: TEST_ADMIN_PW });
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.kdf).toBe("scrypt");
    expect(body.ciphertext).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("pass-secreto-1");
  });
});
