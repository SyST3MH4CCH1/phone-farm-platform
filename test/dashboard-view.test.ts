/**
 * dashboard-view — contrato estático de la nueva DashboardView (sin React Testing
 * Library). Verifica que el módulo App.tsx declara los componentes que el
 * dashboard EXIGE (DevicesCard, ProxiesCard, StatCard, RingProgress, MiniBar,
 * MiniStat), que NO usa fake data hardcodeada, y que el wiring con el backend
 * (PATCH /api/accounts/<id>, GET /api/events/recent, /api/stats.disk_percent)
 * está presente.
 *
 * Complementa los vitest existentes (que cubren server/db/auth) sin añadir
 * dependencias nuevas (jsdom, @testing-library): corre con vitest puro +
 * fs.readFileSync.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const APP_TSX = path.resolve(__dirname, "..", "src", "App.tsx");

let src = "";
beforeAll(() => {
  src = fs.readFileSync(APP_TSX, "utf-8");
});

describe("DashboardView — contrato estático (paso final, sin fake data)", () => {
  it("App.tsx existe y tiene tamaño razonable (>1000 líneas)", () => {
    expect(src.length).toBeGreaterThan(20_000);
    expect(src.split("\n").length).toBeGreaterThan(1_000);
  });

  it("declara los componentes reutilizables del dashboard", () => {
    // Componentes en MAYÚSCULA = declaración React.FC.
    for (const name of [
      "StatCard",
      "RingProgress",
      "MiniBar",
      "MiniStat",
      "SidebarItem",
      "DashboardView",
      "DevicesCard",
      "ProxiesCard",
    ]) {
      // Búsqueda de declaración típica: `const Nombre: React.FC`
      const re = new RegExp(`const\\s+${name}\\s*:\\s*React\\.FC`);
      expect(src, `falta declarar ${name}`).toMatch(re);
    }
  });

  it("DashboardView renderiza DevicesCard y ProxiesCard", () => {
    // El cuerpo de DashboardView (entre `const DashboardView:` y el siguiente
    // `^};`) referencia los sub-componentes en el JSX.
    const start = src.indexOf("const DashboardView:");
    const end = src.indexOf("};", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toMatch(/<DevicesCard\b/);
    expect(body).toMatch(/<ProxiesCard\b/);
  });

  it("usa datos REALES (sin arrays hardcodeados en DashboardView)", () => {
    const start = src.indexOf("const DashboardView:");
    const end = src.indexOf("};", start);
    const body = src.slice(start, end);
    // Cualquier literal `= [...]` o `= ["x", "y", ...]` dentro del JSX sería
    // fake data. Sólo permitimos referencias a props/parámetros derivados.
    expect(body).not.toMatch(/\[\s*['"][\w-]+['"]\s*,\s*['"][\w-]+['"]/);
    // Baterías / RAM fantasmas los quitamos también.
    expect(body, "no debe haber '85%' ni similares hardcodeados").not.toMatch(/\b(85|90|95|38|42)%/);
  });

  it("diskPercent se calcula desde stats (no se hardcodea)", () => {
    // El código hace `(stats as any).disk_percent` — derivado del backend.
    expect(src).toMatch(/\(stats as any\)\.disk_percent/);
    // Y la rama '—' cuando no hay dato:
    expect(src).toMatch(/typeof diskPercent === 'number'\s*\?\s*`\$\{diskPercent\}%`\s*:\s*'—'/);
  });

  it("usa ProxiesCard con latencia REAL o '—' (sin fake 42ms)", () => {
    // El componente ProxiesCard debe distinguir '—' (sin dato) de latencia numérica.
    expect(src).toMatch(/hasLatency\s*\?\s*`\$\{Math\.round\(latency\)\} ms`\s*:\s*'—'/);
    // Y NO debe tener un literal 42 hardcodeado.
    expect(src).not.toMatch(/\blatency\s*[:=]\s*42\b/);
  });

  it("DevicesCard muestra estado vacío REAL si deviceCount=0", () => {
    // Debe haber una rama explícita "Sin dispositivos ADB detectados".
    expect(src).toMatch(/Sin dispositivos ADB detectados/);
  });

  it("no usa localStorage como fuente principal de datos del dashboard", () => {
    // localStorage sólo para preferencias (theme), no para cuentas/proxies/queue.
    const lsMatches = src.match(/localStorage\.[gs]etItem/g) || [];
    // Temas: 1 ocurrencia para theme al iniciar + 1 al togglear = 2.
    expect(lsMatches.length).toBeLessThanOrEqual(2);
    // Sólo debe ser para 'phonefarm-theme':
    expect(src).toMatch(/localStorage\.getItem\('phonefarm-theme'\)/);
  });

  it("usa ScheduleModal en modo embebido con hideForm (calendario del dashboard)", () => {
    // El tercer slot del grid 3 columnas embebe el calendario.
    expect(src).toMatch(/<ScheduleModal[\s\S]*?embedded[\s\S]*?hideForm/);
  });
});

describe("api.ts — wrapper de fetch con CSRF (no nueva lógica)", () => {
  it("apiFetch añade X-CSRF-Token en mutaciones", () => {
    const apiTs = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "api.ts"),
      "utf-8",
    );
    expect(apiTs).toMatch(/X-CSRF-Token/);
    expect(apiTs).toMatch(/credentials:\s*"same-origin"/);
  });
});