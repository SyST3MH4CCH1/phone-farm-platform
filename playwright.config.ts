import { defineConfig, devices } from '@playwright/test';

/**
 * TASK §27.4 / §27.5 — E2E y regresión visual contra el panel REAL.
 *
 * El webServer arranca el build de producción (dist/) servido por server.ts,
 * que es exactamente el runtime que ve el operador: mismo Express, mismo
 * middleware de sesión/CSRF, mismo proxy a Flask. No se falsea ninguna
 * respuesta de la API.
 */
const PORT = Number(process.env.PW_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/.artifacts/report.json' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // El panel es una app de servidor con login: sin sesión, /api/* devuelve 401.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'desktop-1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'wide-1920x1080',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'smoke-1366x768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'mobile-390x844',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false },
    },
  ],
  webServer: {
    // El servidor E2E levanta la app REAL (server/app.ts) sobre dist/ con una
    // BD sembrada y un stub de Flask: no se falsea ninguna ruta del panel.
    // reuseExistingServer=false: Playwright gestiona el ciclo de vida del
    // servidor, así una ejecución no hereda un server zombi de otra.
    command: 'npx tsx e2e/server.ts',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PW_PORT: String(PORT), PW_STUB_PORT: String(PORT + 1) },
  },
});
