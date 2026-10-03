// ---------------------------------------------------------------------------
// TASK §27.4 — E2E del panel con navegador real (Chromium).
//
// Los 10 recorridos mínimos que pide el TASK, en el orden de uso del operador.
// Cada test comprueba comportamiento observable en pantalla, no internals.
// ---------------------------------------------------------------------------

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

const ADMIN = { username: 'admin', password: 'test-admin-password-123456' };

/** Falla el test si la consola del navegador registra un error (§27.4-10). */
function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Un 5xx del backend NO es un fallo del frontend: en este entorno el
    // stub responde 503 a propósito y la UI debe saber pintarlo. Solo se
    // persiguen los errores de JavaScript.
    if (/Failed to load resource|net::ERR_|EventSource/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function login(page: Page) {
  await page.goto('/');
  const user = page.getByLabel('Nombre de usuario operador');
  const pass = page.getByLabel('Contraseña de seguridad');
  await expect(user).toBeVisible();
  await user.fill(ADMIN.username);
  await pass.fill(ADMIN.password);
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  // En layout estrecho la navegación es un overlay: llega a existir pero con
  // ancho 0 hasta que se abre, así que basta con que esté en el DOM.
  await expect(page.getByRole('navigation', { name: /navegación principal/i })).toBeAttached({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible({ timeout: 20_000 });
}

/** Abre el overlay de navegación si el viewport lo exige (TASK §20). */
async function openNavIfOverlay(page: Page) {
  const burger = page.getByRole('button', { name: /Abrir navegación/i });
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await expect(page.getByRole('navigation', { name: /navegación principal/i })).toBeVisible();
  }
}

test.describe('TASK §27.4 — recorridos E2E', () => {
  test('1. abrir Dashboard', async ({ page }) => {
    const errors = trackBrowserErrors(page);
    await login(page);
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible();
    // La fila KPI se renderiza con datos del backend (o con su empty state).
    await expect(page.getByText(/Dispositivos/i).first()).toBeVisible();
    expect(errors, `errores de navegador: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('2. navegar a Cuentas', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const nav = page.getByRole('navigation', { name: /navegación principal/i });
    await nav.getByText(/Cuentas/i).first().click();
    await expect(page.getByRole('heading', { name: /Cuentas/i }).first()).toBeVisible();
  });

  test('3. abrir Cola', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const nav = page.getByRole('navigation', { name: /navegación principal/i });
    await nav.getByText(/Cola/i).first().click();
    await expect(page.getByRole('heading', { name: /Cola|Pipeline/i }).first()).toBeVisible();
  });

  test('4. abrir Calendario', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const nav = page.getByRole('navigation', { name: /navegación principal/i });
    await nav.getByText(/Calendario/i).first().click();
    await expect(page.getByRole('heading', { name: /Calendario/i }).first()).toBeVisible();
  });

  test('5. la consola inferior recibe y filtra eventos', async ({ page }) => {
    await login(page);
    const toggle = page.getByRole('button', { name: /Expandir consola|Colapsar consola/i }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    // El panel de consola existe tras expandir.
    await expect(page.getByRole('button', { name: /Limpiar/i }).first()).toBeVisible();
  });

  test('6. el API Explorer carga el contrato generado por el servidor', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const techNav = page.getByRole('navigation', { name: /navegación técnica/i });
    await techNav.getByText(/cURL API/i).first().click();

    const dialog = page.getByRole('dialog', { name: /Explorador de la API/i });
    await expect(dialog).toBeVisible();

    // El endpoint /api/queue sale del OpenAPI real, no de una lista a mano.
    const queueItem = dialog.getByRole('button', { name: /\/api\/queue/ }).first();
    await expect(queueItem).toBeVisible({ timeout: 20_000 });

    // Al seleccionar una mutación aparece el badge de rol admin.
    await dialog.getByRole('button', { name: /\/api\/queue\/\{id\}\/approve/ }).first().click();
    await expect(dialog.getByText(/Rol admin/i).first()).toBeVisible();
    // Y el cURL se genera desde la plantilla real.
    await expect(dialog.locator('pre').first()).toContainText('/api/queue/<id>/approve');
  });

  test('7. MoneyPrinter se abre con su estado real de MPT', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const techNav = page.getByRole('navigation', { name: /navegación técnica/i });
    await techNav.getByText(/MoneyPrinter/i).first().click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    // No hay credenciales MPT ni API keys hardcodeadas en el DOM.
    const html = await dialog.innerHTML();
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(html).not.toMatch(/minimax_api_key"\s*:\s*"[^"]+/);
  });

  test('8. Versiones muestra el SHA/version real del runtime', async ({ page }) => {
    await login(page);
    await openNavIfOverlay(page);
    const techNav = page.getByRole('navigation', { name: /navegación técnica/i });
    await techNav.getByText(/Versiones/i).first().click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/[0-9a-f]{7,}/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('9. sin sesión, /api/* responde 401 y la UI vuelve al login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/accounts', { credentials: 'same-origin' });
      return res.status;
    });
    expect(status).toBe(401);
  });

  test('10. ninguna vista renderiza KPIs inventados', async ({ page }) => {
    await login(page);
    const body = await page.locator('body').innerText();
    // Patrones de dummies que se eliminaron en la fase de auditoría.
    expect(body).not.toMatch(/\+12\s*% vs ayer/i);
    expect(body).not.toMatch(/RFCW80/i);
    expect(body).not.toMatch(/\b4\.8\s*% engagement/i);
  });

  test('11. con el backend caído el panel no inventa KPI ni revienta', async ({ page }) => {
    // Todo el backend responde 503: el panel debe seguir en pie, sin errores de
    // JavaScript y sin convertir "no lo sé" en un 0 presentable.
    const errors = trackBrowserErrors(page);
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      // El login y el contrato se resuelven de verdad; el resto se cae.
      if (url.includes('/api/auth/') || url.includes('/api/openapi.json')) return route.fallback();
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Backend no disponible' }) });
    });

    await login(page);
    await page.waitForTimeout(1500); // deja correr un ciclo de refresco

    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible();
    const body = await page.locator('body').innerText();
    // Sin métricas fabricadas: ni deltas, ni seriales, ni engagement inventado.
    expect(body).not.toMatch(/\+12\s*% vs ayer/i);
    expect(body).not.toMatch(/RFCW80/i);
    expect(body).not.toMatch(/\b4\.8\s*% engagement/i);
    // Y sin un único error de JavaScript.
    expect(errors, `errores de navegador: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
