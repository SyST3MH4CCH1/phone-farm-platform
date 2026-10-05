import { expect, test } from '@playwright/test';

test('el diálogo de cuenta usa el diseño actual sin desbordarse', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nombre de usuario operador').fill('admin');
  await page.getByLabel('Contraseña de seguridad').fill('test-admin-password-123456');
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  await page.locator('aside').getByRole('button', { name: 'Cuentas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Registra la ficha local de una cuenta que ya controlas.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Día de warmup')).toHaveCount(0);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
});

test('el backup usa campos del producto en lugar de prompts del navegador', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nombre de usuario operador').fill('admin');
  await page.getByLabel('Contraseña de seguridad').fill('test-admin-password-123456');
  await page.getByRole('button', { name: /Iniciar Sesi/ }).click();
  await page.locator('aside').getByRole('button', { name: 'Versiones', exact: true }).click();
  await page.getByRole('button', { name: 'Ver versiones' }).click();
  await page.getByRole('button', { name: 'Backup cifrado (.pfbackup)' }).click();
  await expect(page.getByText('Crear backup cifrado')).toBeVisible();
  await expect(page.getByLabel('Frase del backup')).toBeVisible();
  await expect(page.getByLabel('Contraseña del administrador')).toBeVisible();
});
