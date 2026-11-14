import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

/** Cuántos puntos de fincas de ejemplo y emisoras se ven en el globo. */
const visibleMarkers = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('.demo-marker, .radio-marker')].filter((el) => el.style.display !== 'none')
        .length,
  );

test('ajustes: ocultar los puntos de fincas de ejemplo y emisoras, se recuerda al recargar y se vuelven a mostrar', async ({ page }) => {
  await page.goto('/es?lat=42&lon=-93.5&z=6');
  await waitForGlobe(page);
  const iowa = page.locator('.demo-marker[aria-label*="Iowa"]');
  await expect(iowa).toBeVisible();
  await expect(page.locator('.radio-marker').first()).toBeAttached();

  const toggle = async (to: 'true' | 'false') => {
    await page.getByRole('button', { name: 'Ajustes' }).tap();
    const sw = page.getByRole('dialog', { name: 'Ajustes' }).getByRole('switch', { name: 'Mostrar fincas de ejemplo y emisoras' });
    await expect(sw).toHaveAttribute('aria-checked', to === 'true' ? 'false' : 'true');
    await sw.tap();
    await expect(sw).toHaveAttribute('aria-checked', to);
    await page.keyboard.press('Escape');
  };

  await toggle('false');
  await expect(iowa).toBeHidden();
  expect(await visibleMarkers(page)).toBe(0);

  // Se recuerda en este dispositivo: al recargar, los puntos se crean ya ocultos.
  await page.reload();
  await waitForGlobe(page);
  await expect(iowa).toBeAttached();
  await expect(page.locator('.radio-marker').first()).toBeAttached();
  await expect(iowa).toBeHidden();
  expect(await visibleMarkers(page)).toBe(0);

  await toggle('true');
  await expect(iowa).toBeVisible();
  expect(await visibleMarkers(page)).toBeGreaterThan(0);
});
