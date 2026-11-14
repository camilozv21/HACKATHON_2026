import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean; getLayer(id: string): unknown } };

test('zonas de riesgo: la capa pinta Colombia, cambia de riesgo y deja el relieve a la vista', async ({ page }) => {
  await page.goto('/es?lat=10.9&lon=-72.8&z=6.4&layer=risk');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

  const bar = page.getByRole('region', { name: 'Zonas de riesgo' }).first();
  await expect(bar.getByText('Toca un municipio', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean((window as W).__fieldShiftMap!.getLayer('data-risk'))))
    .toBe(true);

  await bar.getByRole('radio', { name: 'Sequía' }).tap();
  await expect(bar.getByRole('radio', { name: 'Sequía' })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/risk=drought/);
  await expect(bar.getByRole('switch', { name: /Relieve/ })).toBeVisible();

  // Otra capa quita los polígonos.
  await bar.getByRole('button', { name: 'Quitar' }).tap();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as W).__fieldShiftMap!.getLayer('data-risk'))))
    .toBe(false);
});

test('el municipio muestra su riesgo con evidencia y cómo cambió el terreno (Markov)', async ({ page }) => {
  await page.goto('/es?lat=11.35&lon=-72.8&z=7&layer=risk&region=co:44001');
  const drawer = page.getByRole('dialog', { name: /Riohacha/ });
  await expect(drawer).toBeVisible({ timeout: 45_000 });

  const risk = drawer.getByRole('region', { name: 'Zonas de riesgo' });
  await expect(risk).toBeVisible({ timeout: 30_000 });
  await expect(risk.getByText('Lo que no sabemos')).toBeVisible();

  const change = drawer.getByRole('region', { name: 'Cómo cambia el terreno' });
  await expect(change.getByText('2016–2018')).toBeVisible();
  await expect(change.getByRole('img', { name: /Diagrama de cambios del terreno/ })).toBeVisible();
  await change.getByRole('button', { name: 'Ver como tabla' }).tap();
  await expect(change.getByRole('table').first()).toBeVisible();

  const a11y = await new AxeBuilder({ page }).include('[aria-labelledby="terrain-change-title"]').include('[aria-labelledby="terrain-risk-title"]').analyze();
  expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
