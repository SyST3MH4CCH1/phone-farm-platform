import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const views = [
  ['Cuentas', 'Cuentas'],
  ['Cola', 'Cola'],
  ['Calendario', 'Calendario'],
  ['MoneyPrinter', 'MoneyPrinter'],
  ['Panda live', 'Panda Live'],
  ['Proxies', 'Proxies'],
  ['cURL API', 'cURL API'],
  ['Código Python', 'Código Python'],
  ['Versiones', 'Versiones'],
] as const;

test('las nueve secciones de referencia cargan y conservan la navegación', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/');
  await page.getByLabel('Nombre de usuario operador').fill('admin');
  await page.getByLabel('Contraseña de seguridad').fill('test-admin-password-123456');
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  const sidebar = page.getByRole('navigation', { name: /Navegación principal/i });
  await expect(sidebar).toBeVisible();
  const output = path.resolve('docs/evidence/ui/reference-1672');
  fs.mkdirSync(output, { recursive: true });

  for (const [navLabel, heading] of views) {
    await page.getByRole('button', { name: navLabel, exact: true }).last().click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('banner').first()).toBeVisible();
    await expect(sidebar).toBeVisible();
    await page.screenshot({ path: path.join(output, `${heading.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.png`), fullPage: false });
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
