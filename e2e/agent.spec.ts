import { expect, test } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean; getCenter(): { lng: number; lat: number } } };

test('el agente mock vuela al Punjab, activa SMAP y abre la región en una sola respuesta', async ({ page }) => {
  await page.goto('/es?lat=10&lon=-40&z=2');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  const input = page.getByRole('textbox', { name: 'Tu pregunta' });
  await input.fill('muéstrame la humedad del suelo en el Punjab');
  await page.getByRole('button', { name: 'Enviar pregunta' }).tap();

  await expect(page.getByRole('dialog', { name: /Punjab/ })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/layer=soil-moisture/);
  const c = await page.evaluate(() => (window as W).__fieldShiftMap!.getCenter());
  expect(c.lng).toBeGreaterThan(70);
  expect(c.lat).toBeGreaterThan(25);

  // En móvil el chat queda en la barra para que se vea el drawer; al reabrirlo está la respuesta con fuente.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  await expect(page.getByText('SMAP L4 Root Zone Soil Moisture')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a donde estaba' })).toBeVisible();
  await expect(page.getByText(/Respuestas generadas por IA con datos NASA/)).toBeVisible();
});
