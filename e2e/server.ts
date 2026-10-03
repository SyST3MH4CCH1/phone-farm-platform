// ---------------------------------------------------------------------------
// TASK §27.4 — Servidor para los E2E de navegador.
//
// Arranca la MISMA app de producción (server/app.ts) sirviendo el build real
// de dist/, con una BD en memoria sembrada y un backend stub en el puerto que
// usa el proxy a Flask.
//
// Por qué un stub: en la máquina de CI no hay plataforma Python, ADB ni MPT.
// El stub NO falsea el panel: devuelve respuestas vacías/errores honestos
// (503 "backend no disponible") que son exactamente lo que la UI debe saber
// pintar como error/stale. Cuando el operador tiene la plataforma real, los
// tests se ejecutan contra ella con PW_LIVE=1 (ver e2e/README.md).
// ---------------------------------------------------------------------------

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import Database from "better-sqlite3";
import { createApp } from "../server/app";
import { seedDb, testConfig, TEST_ADMIN_PW } from "../test/helpers";

const PORT = Number(process.env.PW_PORT ?? 4173);
const STUB_PORT = Number(process.env.PW_STUB_PORT ?? 4999);
/** Si se define, el proxy real habla con la plataforma del operador. */
const REAL_BACKEND = process.env.PW_USE_REAL_BACKEND;

export const E2E_ADMIN = { username: "admin", password: TEST_ADMIN_PW };

/**
 * Middleware estático sobre el build real (`vite build`).
 * La app solo sirve dist/ cuando NODE_ENV=production; aquí se inyecta el mismo
 * middleware que usaría producción para no relajar la validación de cookies
 * seguras de producción en una máquina de pruebas.
 */
function serveDist(): express.RequestHandler {
  const dist = path.resolve(process.cwd(), "dist");
  const staticFiles = express.static(dist, { index: false, maxAge: 0 });
  return (req, res, next) => {
    if (!fs.existsSync(path.join(dist, "index.html"))) {
      res.status(500).type("text/plain").send("dist/index.html no existe: ejecuta `npx vite build` antes de los E2E.");
      return;
    }
    staticFiles(req, res, (err?: unknown) => {
      if (err) { next(err); return; }
      res.sendFile(path.join(dist, "index.html"));
    });
  };
}

/** Body que el panel recibe del backend en cada endpoint que proxea. */
const STUB_ROUTES: Record<string, unknown> = {
  "GET /api/stats": {
    videos_subidos: 0, acciones_hoy: 0, errores: 0,
    cpu_percent: 12.5, ram_percent: 38.1,
    active_bots: 0, active_proxies: 0, panda_grid_status: "Disconnected",
  },
  "GET /api/accounts": [],
  "GET /api/proxies": [],
  "GET /api/queue": [],
  "GET /api/drafts": [],
  "GET /api/content/profiles": [],
};

const stub = http.createServer((req, res) => {
  const key = `${req.method} ${(req.url ?? "").split("?")[0]}`;
  if (key in STUB_ROUTES) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(STUB_ROUTES[key]));
    return;
  }
  // El resto (preview, generate, publish…) no se ejecuta en E2E: 503 explícito.
  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Backend de pruebas no disponible para esta ruta." }));
});

const db: Database.Database = seedDb();
const flaskBase = REAL_BACKEND || `http://127.0.0.1:${STUB_PORT}`;
const app = createApp(
  testConfig({ PORT: String(PORT), FLASK_BASE: flaskBase }),
  { db, viteMiddleware: serveDist() },
);

function startPanel() {
  app.listen(PORT, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`[e2e] panel http://127.0.0.1:${PORT} · backend=${flaskBase} · dist=${path.resolve("dist")}`);
  });
}

if (REAL_BACKEND) {
  // Plataforma real del operador: no se levanta el stub.
  startPanel();
} else {
  stub.listen(STUB_PORT, "127.0.0.1", startPanel);
}
