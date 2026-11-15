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
  // Solo audios grabados (NEXT_PUBLIC_RADIO_AUDIO_ONLY, por defecto): suena el del equipo y nada más; ni los
  // ejemplos sin mp3 ni el interruptor de "la radio mueve el mapa" (no hay programa con pistas).
  await expect(radio.getByText('Mensaje de la Radio del Campo').first()).toBeVisible();
  await expect(radio.getByText('Lluvias fuertes en octubre y noviembre')).toHaveCount(0);
  await expect(radio.getByRole('switch')).toHaveCount(0);
});
