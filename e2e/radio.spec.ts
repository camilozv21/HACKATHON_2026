import { expect, test } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };

test('la radio sintoniza la emisora más cercana, no suena sola y muestra la transcripción', async ({ page }) => {
  await page.goto('/es?lat=4.6&lon=-75.7&z=7');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

  const radio = page.getByRole('region', { name: 'Radio del campo' });
  await expect(radio).toBeVisible();
  await expect(radio.getByText(/Radio Campo Quindío/)).toBeVisible();
  // Sin autoplay: el botón invita a escuchar (no a pausar).
  await expect(radio.getByRole('button', { name: 'Escuchar la radio del campo' })).toBeVisible();

  await radio.getByRole('button', { name: 'Ver transcripción y próximos segmentos' }).tap();
  await expect(radio.getByText('Transcripción', { exact: true })).toBeVisible();
  // El audio destacado del equipo suena primero; la alerta de GPM de la emisora viene después.
  await expect(radio.getByText('Mensaje de la Radio del Campo').first()).toBeVisible();
  await expect(radio.getByText('Lluvias fuertes en octubre y noviembre')).toBeVisible();
  await expect(radio.getByText('Anuncio').first()).toBeVisible();
});
