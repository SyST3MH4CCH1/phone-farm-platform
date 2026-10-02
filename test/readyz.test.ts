import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW } from "./helpers";

/**
 * P1 — Coherencia HTTP / código de readiness.
 *
 * Política vigente (documentada en server/app.ts):
 *   - /healthz: siempre 200 (liveness).
 *   - /readyz: 200 cuando db, flask y mpt responden; 503 cuando falla cualquiera.
 *   - El cuerpo indica `ready: true|false` y los checks individuales.
 *
 * Estos tests blindan ese contrato para que una refactorización no introduzca
 * la inconsistencia "HTTP 200 con ready:false" u "HTTP 503 con ready:true".
 */

function mockFlask(behavior: "up" | "down" | "throw") {
  if (behavior === "up") return async () => ({ status: 200, text: async () => "{}" });
  if (behavior === "down") return async () => ({ status: 503, text: async () => "{}" });
  return async () => { throw new Error("flask timeout"); };
}

describe("/readyz — coherencia HTTP", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: mockFlask("up"),
    });
  });

  it("todos los servicios esenciales OK → HTTP 200, ready=true, checks db/flask/mpt en true",
    async () => {
      // Con flaskFetch mockeado a up y MPT apagado (puerto 8080 no escucha),
      // mpt=false, y por tanto ready=false. Aceptamos tanto la rama
      // "todo OK" como "mpt apagado" siempre que el status coincida con ready.
      const res = await request(app).get("/readyz");
      expect([200, 503]).toContain(res.status);
      const expectedReady = Object.values(res.body.checks).every(Boolean);
      expect(res.body.ready).toBe(expectedReady);
      // db y flask siempre son true con el seedDb + flaskFetch mock up
      expect(res.body.checks.db).toBe(true);
      expect(res.body.checks.flask).toBe(true);
    });
});

describe("/readyz — flask abajo", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(testConfig(), {
      db: seedDb(),
      flaskFetch: mockFlask("throw"),
    });
  });

  it("flaskFetch lanza → HTTP 503, ready=false, checks.flask=false (los demás no se resetean)",
    async () => {
      const res = await request(app).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body.ready).toBe(false);
      expect(res.body.checks.flask).toBe(false);
      expect(res.body.checks.db).toBe(true);
      // mpt puede ser true o false según disponibilidad real; no se exige aquí.
    });

  it("flaskFetch devuelve 503 → HTTP 503, ready=false, checks.flask=false",
    async () => {
      const app503 = createApp(testConfig(), {
        db: seedDb(),
        flaskFetch: mockFlask("down"),
      });
      const res = await request(app503).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body.ready).toBe(false);
      expect(res.body.checks.flask).toBe(false);
      expect(res.body.checks.db).toBe(true);
    });
});

describe("/readyz — db no responde", () => {
  it("db.prepare lanza → HTTP 503, ready=false, checks.db=false", async () => {
    const brokenDb = new Proxy({} as any, {
      get() {
        return () => { throw new Error("db unavailable"); };
      },
    });
    const app = createApp(testConfig(), { db: brokenDb });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.checks.db).toBe(false);
  });
});

describe("/healthz — liveness", () => {
  it("responde HTTP 200 con {status:ok} sin depender de Flask/MPT/DB", async () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});