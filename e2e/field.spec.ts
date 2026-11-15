import { expect, test } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean; getZoom(): number } };

const waitForGlobe = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('dibujar una parcela de 4 vértices con taps y abrir el análisis', async ({ page }) => {
  await page.goto('/es?lat=4.53&lon=-75.77&z=15');
  await waitForGlobe(page);

  await page.getByRole('button', { name: 'Mi finca', exact: true }).tap();
  await page.getByRole('button', { name: /Dibujar el contorno/ }).tap();
  await page.waitForTimeout(800);

  const box = (await page.locator('canvas.maplibregl-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (const [dx, dy] of [
    [-90, -80],
    [90, -90],
    [100, 70],
    [-80, 90],
  ] as const) {
    await page.touchscreen.tap(cx + dx, cy + dy);
    await page.waitForTimeout(250);
  }
  await expect(page.getByRole('status').filter({ hasText: /ha/ })).toBeVisible();

  // Deshacer quita el último vértice y se puede volver a poner.
  await page.getByRole('button', { name: 'Deshacer', exact: true }).tap();
  await page.touchscreen.tap(cx - 80, cy + 90);
  await page.getByRole('button', { name: 'Terminar', exact: true }).tap();

  // Al terminar se abre el drawer de la finca en "Recomendación" y el motor arranca sin otro toque.
  await expect(page).toHaveURL(/field=p%3A|field=p:/);
  await expect(page.getByRole('tab', { name: 'Recomendación' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/view=motor/);
  await expect(page.getByRole('heading', { name: 'Tu plan de rotación' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Generar plan de rotación de cultivos' })).toBeHidden();
});

test('una finca demo se abre desde su punto y recargar la URL restaura la vista', async ({ page }) => {
  await page.goto('/es?lat=0&lon=-60&z=2');
  await waitForGlobe(page);

  // El punto demo abre la región; desde el drawer se entra a la finca demo.
  await page.locator('.demo-marker[aria-label*="Pergamino"]').click();
  await page.getByRole('button', { name: 'Ver la finca demo de esta región' }).click();
  await expect(page.getByText('Campo de soya y trigo (demo)', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/field=demo(%3A|:)pampa-pergamino/);

  // Esperar a que termine el vuelo y la URL tenga la cámara de la finca.
  await expect(page).toHaveURL(/z=1[3-7]/, { timeout: 15_000 });
  await page.reload();
  await waitForGlobe(page);
  await expect(page.getByText('Campo de soya y trigo (demo)', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as W).__fieldShiftMap!.getZoom())).toBeGreaterThan(12);
});
