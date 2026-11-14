import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('sin conexión: abre la app desde el teléfono y muestra el último análisis guardado', async ({ page, context }) => {
  const url = '/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=conditions';
  await page.goto(url);
  await waitForGlobe(page);
  await expect(page.getByRole('heading', { name: 'Resumen de tu finca' })).toBeVisible();
  // El service worker queda activo y guarda el shell y los archivos ya cargados.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(2000);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText('Estás sin conexión. Ves tu último análisis guardado.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Resumen de tu finca' })).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.setOffline(false);
  }
});
