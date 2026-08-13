import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { loadConfig } from "../server/config";
import { createApp, CSRF_COOKIE } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW } from "./helpers";

/** Normaliza set-cookie (string | string[] en supertest). */
function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
}

describe("arranque seguro — validación de config", () => {
  it("rechaza NODE_ENV fuera de whitelist o ausente", () => {
    expect(() => loadConfig({})).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: "dev" })).toThrow(/NODE_ENV/);
  });

  it("rechaza credenciales demo o cortas", () => {
    expect(() => loadConfig({ NODE_ENV: "test", ADMIN_PASSWORD: "admin123", OPERATOR_PASSWORD: "operator123", PHONE_FARM_INTERNAL_TOKEN: ""tok-placeholder"" })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadConfig({ NODE_ENV: "test", ADMIN_PASSWORD: "corta", OPERATOR_PASSWORD: "corta", PHONE_FARM_INTERNAL_TOKEN: ""tok-placeholder"" })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadConfig({ NODE_ENV: "test", ADMIN_PASSWORD: "x".repeat(16), OPERATOR_PASSWORD: "x".repeat(16), PHONE_FARM_INTERNAL_TOKEN: "" })).toThrow(/INTERNAL_TOKEN/);
  });

  it("fuerza escucha en 127.0.0.1 en todos los entornos", () => {
    expect(testConfig().listenHost).toBe("127.0.0.1");
  });

  it("no admite PUBLIC_BASE_URL https con COOKIE_SECURE=false", () => {
    expect(() => testConfig({ PUBLIC_BASE_URL: "https://panel.example", COOKIE_SECURE: "false" })).toThrow(/insegura/);
  });
});

describe("arranque seguro — HTTP/CSRF", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(testConfig(), { db: seedDb() });
  });

  it("no expone X-Powered-By y añade cabeceras de hardening", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("login emite cookie de sesión y cookie CSRF", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    const cookies = setCookies(res);
    const joined = cookies.join(";");
    expect(joined).toContain("pf_session=");
    expect(joined).toContain("HttpOnly");
    expect(joined).toContain("Secure");
    expect(joined).toContain("SameSite=Strict");
    expect(joined).toContain(`${CSRF_COOKIE}=`);
    // la cookie CSRF no es HttpOnly (la lee el JS) pero sí SameSite=Strict
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`)) || "";
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie).toContain("SameSite=Strict");
  });

  it("mutación sin token CSRF → 403", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    const cookies = setCookies(login).map((c) => c.split(";")[0]).join("; ");
    const res = await request(app)
      .post("/api/queue")
      .set("Cookie", cookies)
      .send({ keyword: "test" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/);
  });

  it("mutación con token CSRF correcto → llega al backend (mocked)", async () => {
    let flaskHit = false;
    const appMock = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: async () => {
        flaskHit = true;
        return { status: 200, text: async () => JSON.stringify({ ok: true }) };
      },
    });
    const login = await request(appMock)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    const cookies = setCookies(login);
    const sessionCookie = cookies.find((c) => c.startsWith("pf_session="))!.split(";")[0];
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`))!.split(";")[0];
    const csrf = csrfCookie.split("=")[1];

    const res = await request(appMock)
      .post("/api/queue")
      .set("Cookie", `${sessionCookie}; ${csrfCookie}`)
      .set("X-CSRF-Token", csrf)
      .send({ keyword: "test" });
    expect(res.status).toBe(200);
    expect(flaskHit).toBe(true);
  });

  it("mutación con Origin malicioso → 403 aunque el token CSRF sea válido", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    const cookies = setCookies(login);
    const sessionCookie = cookies.find((c) => c.startsWith("pf_session="))!.split(";")[0];
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`))!.split(";")[0];
    const csrf = csrfCookie.split("=")[1];
    const res = await request(app)
      .post("/api/queue")
      .set("Cookie", `${sessionCookie}; ${csrfCookie}`)
      .set("X-CSRF-Token", csrf)
      .set("Origin", "https://evil.example")
      .send({ keyword: "test" });
    expect(res.status).toBe(403);
  });
});
