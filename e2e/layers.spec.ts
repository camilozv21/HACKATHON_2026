import { expect, test } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean; getLayer(id: string): unknown } };

test('activar una capa NASA desde el catálogo en móvil muestra leyenda, fecha y fuente', async ({ page }) => {
  await page.goto('/es?lat=5&lon=-60&z=2');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

  await page.getByRole('button', { name: /Abrir capas de datos NASA/ }).tap();
  await page.getByRole('switch', { name: /Verdor de las plantas/ }).tap();

  const bar = page.getByRole('region', { name: 'Verdor de las plantas' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText(/Terra/)).toBeVisible();
  await expect(page).toHaveURL(/layer=ndvi/);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as W).__fieldShiftMap!.getLayer('data-ndvi'))))
    .toBe(true);

  // Quitar la capa la saca del mapa y de la URL.
  await bar.getByRole('button', { name: 'Quitar' }).tap();
  await expect(page).not.toHaveURL(/layer=/);
});

test('un enlace con ?layer y fecha restaura la capa', async ({ page }) => {
  await page.goto('/es?lat=20&lon=78&z=3&layer=rain&ldate=2026-08-15');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });
  const bar = page.getByRole('region', { name: 'Lluvia del día' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: /Elegir fecha: 15 ago 2026/ })).toBeVisible();
});
