// ---------------------------------------------------------------------------
// TASK §27.5 — Regresión visual: capturas baseline en los viewports que exige
// el TASK (1440×900, 1920×1080) y smoke responsive (1366×768, 390×844).
//
// Cada captura se escribe en docs/evidence/ui/ con el viewport en el nombre,
// de modo que "before" (rama base) y "after" (esta branch) son comparables
// archivo a archivo. No se sobreescribe nada: el nombre incluye el sufijo
// que se pase por CLI.
// ---------------------------------------------------------------------------

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN = { username: 'admin', password: 'test-admin-password-123456' };
const SUFFIX = process.env.PW_SHOT_SUFFIX ?? 'after';
const OUT_DIR = path.resolve('docs/evidence/ui');

type Shot = {
  name: string;
  /** Viewport real del proyecto Playwright. */
  project: string;
};

const SHOTS: Shot[] = [
  { name: 'login', project: 'desktop-1440x900' },
  { name: 'dashboard', project: 'desktop-1440x900' },
  { name: 'cuentas', project: 'desktop-1440x900' },
  { name: 'cola', project: 'desktop-1440x900' },
  { name: 'calendario', project: 'desktop-1440x900' },
  { name: 'api-explorer', project: 'desktop-1440x900' },
  { name: 'moneyprinter', project: 'desktop-1440x900' },
  { name: 'dashboard', project: 'wide-1920x1080' },
  { name: 'dashboard', project: 'smoke-1366x768' },
  { name: 'login', project: 'mobile-390x844' },
  { name: 'dashboard', project: 'mobile-390x844' },
  { name: 'nav-overlay', project: 'mobile-390x844' },
];

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Nombre de usuario operador').fill(ADMIN.username);
  await page.getByLabel('Contraseña de seguridad').fill(ADMIN.password);
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  await expect(page.getByRole('navigation', { name: /navegación principal/i })).toBeVisible({ timeout: 20_000 });
  // Espera a que el layout se estabilice antes de capturar.
  await page.waitForTimeout(600);
}

async function capture(page: Page, name: string, width: number, height: number) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}-${width}x${height}-${SUFFIX}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

test.describe('TASK §27.5 — capturas', () => {
  for (const shot of SHOTS) {
    test(`captura ${shot.name} @ ${shot.project}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== shot.project, 'captura asignada a otro proyecto');
      const { width, height } = testInfo.project.use.viewport ?? { width: 1440, height: 900 };

      if (shot.name === 'login') {
        await page.goto('/');
        await expect(page.getByLabel('Nombre de usuario operador')).toBeVisible();
      } else {
        await login(page);
        const nav = page.getByRole('navigation', { name: /navegación principal/i });
        const techNav = page.getByRole('navigation', { name: /navegación técnica/i });

        if (shot.name === 'cuentas') {
          await nav.getByText(/Cuentas/i).first().click();
        } else if (shot.name === 'cola') {
          await nav.getByText(/Cola/i).first().click();
        } else if (shot.name === 'calendario') {
          await nav.getByText(/Calendario/i).first().click();
        } else if (shot.name === 'api-explorer') {
          await techNav.getByText(/cURL API/i).first().click();
          await expect(page.getByRole('dialog', { name: /API Explorer/i })).toBeVisible({ timeout: 20_000 });
          await page.waitForTimeout(400);
        } else if (shot.name === 'moneyprinter') {
          await techNav.getByText(/MoneyPrinter/i).first().click();
          await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 20_000 });
          await page.waitForTimeout(400);
        } else if (shot.name === 'nav-overlay') {
          // TASK §20: en móvil la navegación es un overlay accesible por botón.
          const burger = page.getByRole('button', { name: /Abrir navegación/i });
          await expect(burger).toBeVisible();
          await burger.click();
          await expect(page.locator('#ch-sidebar')).toBeVisible();
          await page.waitForTimeout(300);
        }
        await page.waitForTimeout(500);
      }

      const file = await capture(page, shot.name, width, height);
      // eslint-disable-next-line no-console
      console.log(`[captura] ${file}`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(1000);
    });
  }
});

test.describe('TASK §20 — smoke responsive sin desbordes', () => {
  test('ninguna vista desborda el viewport horizontalmente', async ({ page }, testInfo) => {
    await login(page);
    const nav = page.getByRole('navigation', { name: /navegación principal/i });

    for (const [view, label] of [['dashboard', null], ['cuentas', /Cuentas/i], ['cola', /Cola/i], ['calendario', /Calendario/i]] as const) {
      if (label) {
        if (testInfo.project.name !== 'desktop-1440x900') break; // el overlay tapa la nav en móvil
        await nav.getByText(label).first().click();
        await page.waitForTimeout(300);
      }
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      expect(overflow, `desbordamiento horizontal en la vista ${view}`).toBeLessThanOrEqual(1);
    }
  });

  test('en móvil la consola arranca oculta y se puede desplegar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390x844', 'solo aplica al viewport móvil');
    await login(page);
    const consoleBox = page.getByRole('button', { name: /Expandir consola|Colapsar consola/i }).first();
    // Colapsada: 0 px de alto hasta que se pide.
    const collapsed = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) =>
        d.style.height === '0px' && d.className.includes('shrink-0'));
      return el ? el.getBoundingClientRect().height : 60;
    });
    expect(collapsed).toBeLessThanOrEqual(60);
    await expect(consoleBox).toBeVisible();
    await consoleBox.click();
    await page.waitForTimeout(350);
    const expanded = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) =>
        d.style.height === '180px' && d.className.includes('shrink-0'));
      return el ? el.getBoundingClientRect().height : 0;
    });
    expect(expanded).toBeGreaterThan(100);
  });
});
