import { expect, test } from '@playwright/test';

test('el encabezado mantiene sus espacios al navegar con datos cargados', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nombre de usuario operador').fill('admin');
  await page.getByLabel('Contraseña de seguridad').fill('test-admin-password-123456');
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  for (const width of [1919, 1366]) {
    await page.setViewportSize({ width, height: 944 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'DASHBOARD' })).toBeVisible();
    await expect(page.locator('.ref-header-bots-state')).toBeVisible();

    const geometry = async () => page.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error(`Falta ${selector}`);
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return {
        nav: box('.ref-top-nav'), lastTab: box('.ref-top-nav button:last-child'),
        stats: box('.ref-header-stats'), bots: box('.ref-header-bots'),
        badge: box('.ref-header-bots-state'), proxies: box('.ref-header-stats > span:nth-child(3)'),
        cpu: box('.ref-header-stats > span:nth-child(4)'), zip: box('.ref-header-stats > button:nth-child(5)'),
        date: box('.ref-header-stats > span:nth-child(6)'),
      };
    });

    const dashboard = await geometry();
    for (const item of [dashboard.bots, dashboard.proxies, dashboard.cpu, dashboard.zip, dashboard.date]) {
      expect(item.bottom - item.top).toBeLessThanOrEqual(30);
    }
    expect(dashboard.badge.top).toBeGreaterThanOrEqual(dashboard.bots.top);
    expect(dashboard.badge.bottom).toBeLessThanOrEqual(dashboard.bots.bottom);
    expect(Math.abs(dashboard.lastTab.right - dashboard.stats.left)).toBeLessThanOrEqual(2);
    for (const [left, right] of [[dashboard.bots, dashboard.proxies], [dashboard.proxies, dashboard.cpu], [dashboard.cpu, dashboard.zip], [dashboard.zip, dashboard.date]]) {
      expect(left.right).toBeLessThan(right.left);
    }

    await page.locator('aside').getByRole('button', { name: 'Cuentas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cuentas', exact: true })).toBeVisible();
    const cuentas = await geometry();
    expect(cuentas).toEqual(dashboard);
  }
});
