import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW } from "./helpers";

describe("createApp — smoke de seguridad", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(testConfig(), { db: seedDb() });
  });

  it("la app se construye sin abrir puertos", () => {
    expect(app).toBeDefined();
  });

  it("GET /api/auth/me sin sesión responde 200 authenticated=false", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: false });
  });

  it("login con credenciales válidas → 200, cookie HttpOnly + SameSite=Lax, sin token en body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "admin" });
    expect(res.body.token).toBeUndefined();
    const setCookie = res.headers["set-cookie"]?.[0] || "";
    expect(setCookie).toContain("HttpOnly");
    // SEC-FIND-015: SameSite=Lax para cookie de sesión
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toContain("Secure"); // cookieSecure por defecto
  });

  it("login con credenciales inválidas → 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "incorrecta" });
    expect(res.status).toBe(401);
  });

  it("API sin sesión → 401", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(401);
  });

  it("API desconocida con sesión → 404 JSON", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: TEST_ADMIN_PW });
    const headers = login.headers["set-cookie"];
    const cookie = (Array.isArray(headers) ? headers[0] : String(headers)).split(";")[0];
    const res = await request(app).get("/api/no-existe").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
