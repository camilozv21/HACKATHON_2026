import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('modo demo (?demo=1): el recorrido guiado llega al resumen imprimible sin fallas', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/es?demo=1');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Empezar', exact: true }).tap();

  const step = (id: string, timeout = 30_000) => expect(page.locator(`[data-demo-step="${id}"]`)).toBeVisible({ timeout });

  await step('location', 10_000);
  await step('region');
  await expect(page.getByText(/SMAP/).first()).toBeVisible();
  await step('radio');
  await step('agent');
  // El agente (mock en los e2e) vuela al Punjab y activa la humedad del suelo.
  await expect(page).toHaveURL(/layer=soil-moisture/, { timeout: 40_000 });
  await step('farm', 60_000);
  await expect(page.getByRole('heading', { name: 'Resumen de tu finca' })).toBeVisible({ timeout: 30_000 });
  await step('calendar');
  await step('rotations');
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();
  await step('priorities');
  await step('plan');
  await expect(page.getByRole('heading', { name: 'Tu plan de siembra' })).toBeVisible();
  await step('print');
  await expect(page.getByRole('link', { name: 'Ver resumen imprimible' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('una ruta desconocida muestra un 404 amable', async ({ page }) => {
  const res = await page.goto('/es/no-existe');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al globo' })).toHaveAttribute('href', '/es');
});
