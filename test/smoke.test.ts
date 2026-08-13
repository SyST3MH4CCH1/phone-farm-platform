import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { loadConfig } from "../server/config";
import { createApp } from "../server/app";

function testConfig() {
  return loadConfig({
    NODE_ENV: "test",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "test-admin-password-123456",
    OPERATOR_USERNAME: "operator",
    OPERATOR_PASSWORD: "test-operator-password-1234",
    PHONE_FARM_INTERNAL_TOKEN: ""test-token-placeholder"",
  });
}

describe("createApp — smoke de seguridad", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(testConfig());
  });

  it("la app se construye sin abrir puertos", () => {
    expect(app).toBeDefined();
  });

  it("GET /api/auth/me sin sesión responde 200 authenticated=false", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: false });
  });

  it("login con credenciales válidas → 200, cookie HttpOnly + SameSite=Strict, sin token en body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "test-admin-password-123456" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "admin" });
    expect(res.body.token).toBeUndefined();
    const setCookie = res.headers["set-cookie"]?.[0] || "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
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
      .send({ username: "admin", password: "test-admin-password-123456" });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] || "";
    const res = await request(app).get("/api/no-existe").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
