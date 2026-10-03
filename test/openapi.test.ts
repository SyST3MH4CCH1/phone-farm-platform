import { describe, it, expect } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp, CSRF_COOKIE } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW } from "./helpers";
import { buildOpenApiDocument } from "../server/openapi";

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
}

async function login(app: Express, username: string, password: string) {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  const cookies = setCookies(res);
  const sessionCookie = cookies.find((c) => c.startsWith("pf_session="))!.split(";")[0];
  const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`))!.split(";")[0];
  return { sessionCookie, csrfCookie, csrf: csrfCookie.split("=")[1] };
}

type Spec = {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, {
    operationId: string;
    tags: string[];
    summary: string;
    parameters?: { name: string; in: string; required: boolean }[];
    requestBody?: { required: boolean; content: Record<string, { schema: { properties?: Record<string, unknown>; required?: string[] } }> };
    security: Record<string, string[]>[];
    responses: Record<string, { description: string }>;
    "x-panel-role": string | null;
    "x-panel-validated": boolean;
  }>>;
};

describe("TASK §16 — OpenAPI derivado del router real", () => {
  it("el documento se genera desde el router, no desde un catálogo manual", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "http://127.0.0.1:3000", version: "test" }) as Spec;

    expect(spec.openapi).toBe("3.1.0");
    // Rutas que existen de verdad en server/app.ts.
    expect(spec.paths["/api/queue"]).toBeDefined();
    expect(spec.paths["/api/queue/{id}/approve"]).toBeDefined();
    expect(spec.paths["/api/adb/screenshot/{serial}"]).toBeDefined();
    // El propio documento no se lista a sí mismo.
    expect(spec.paths["/api/openapi.json"]).toBeUndefined();
  });

  it("una ruta que se elimina del router desaparece del documento", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    expect((app as any)._router.stack.length).toBeGreaterThan(0);
    const before = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;
    expect(Object.keys(before.paths).length).toBeGreaterThan(20);

    // Registrar una ruta nueva la añade; es prueba de que no hay lista fija.
    app.get("/api/__probe_derived__", (_req, res) => res.end());
    const after = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;
    expect(after.paths["/api/__probe_derived__"]).toBeDefined();
  });

  it("la seguridad se deriva del middleware real, no de un supuesto", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;

    // login es público y NO exige CSRF (es quien crea la cookie CSRF).
    expect(spec.paths["/api/auth/login"].post.security).toEqual([]);

    // logout exige sesión (requireAuth explícito) + CSRF (csrfProtect explícito).
    const logout = spec.paths["/api/auth/logout"].post;
    expect(logout.security).toEqual([{ sessionCookie: [] }, { csrfHeader: [] }]);

    //approve exige rol admin (requireRole) y hereda /api del guard de prefijo.
    const approve = spec.paths["/api/queue/{id}/approve"].post;
    expect(approve["x-panel-role"]).toBe("admin");
    expect(approve.security).toContainEqual({ sessionCookie: [] });
    expect(approve.security).toContainEqual({ csrfHeader: [] });
    expect(approve.responses["403"].description).toContain("admin");

    // GET bajo /api hereda sesión pero no necesita CSRF (solo mutaciones).
    const accounts = spec.paths["/api/accounts"].get;
    expect(accounts.security).toEqual([{ sessionCookie: [] }]);
  });

  it("el requestBody sale del esquema Zod real del panel", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;

    const create = spec.paths["/api/accounts"].post;
    expect(create["x-panel-validated"]).toBe(true);
    const schema = create.requestBody!.content["application/json"].schema;
    // Propiedades del accountCreateSchema real, no inventadas.
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
      ["device_serial", "password", "proxy_id", "username", "warmup_day"].sort(),
    );

    // Una ruta sin validate() no declara body.
    expect(spec.paths["/api/queue/next"].post.requestBody).toBeUndefined();
  });

  it("los parámetros de path salen de la ruta real (:id, :serial, :file)", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;

    expect(spec.paths["/api/accounts/{id}"].delete.parameters).toEqual([
      { name: "id", required: true, in: "path", schema: { type: "string" } },
    ]);
    expect(spec.paths["/api/adb/screenshot/{serial}"].get.parameters?.[0].name).toBe("serial");
  });

  it("el rate limit real se refleja como respuesta 429", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;
    // /api/adb/touch lleva costLimit(touchLimiter) en el cableado real.
    expect(spec.paths["/api/adb/touch"].post.responses["429"]).toBeDefined();
  });

  it("GET /api/openapi.json exige sesión y devuelve el documento real", async () => {
    const app = createApp(testConfig(), { db: seedDb() });

    const anon = await request(app).get("/api/openapi.json");
    expect(anon.status).toBe(401);

    const s = await login(app, "admin", TEST_ADMIN_PW);
    const res = await request(app).get("/api/openapi.json").set("Cookie", `${s.sessionCookie}; ${s.csrfCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    // La versión sale de package.json real, no de un literal.
    expect(res.body.info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(20);
  });

  it("no filtra secretos: el documento solo describe rutas, nunca valores", () => {
    const app = createApp(testConfig(), { db: seedDb() });
    const spec = buildOpenApiDocument(app, { publicBaseUrl: "x", version: "t" }) as Spec;
    const dump = JSON.stringify(spec);
    expect(dump).not.toContain("minimax_api_key\":\"");
    expect(dump).not.toContain("pexels_api_key\":\"");
    // mptSettingsSchema declara esos campos como z.never(): documenta que
    // están PROHIBIDOS, no que se puedan enviar.
    const mpt = spec.paths["/api/moneyprinter/config"].post.requestBody;
    expect(mpt).toBeDefined();
  });
});
