import { expect, test, type Page } from '@playwright/test';

type W = Window & {
  __fieldShiftMap?: {
    loaded(): boolean;
    project(p: [number, number]): { x: number; y: number };
    getCanvas(): HTMLCanvasElement;
    queryRenderedFeatures(o: { layers: string[] }): unknown[];
  };
};
const waitForGlobe = (page: Page) => page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

// Los e2e corren sin base de datos (DATABASE_URL='' en playwright.config.ts): publicaciones en memoria y mercado del seed.

test('publicar mi finca: 3 pasos, sin teléfono en la página y contacto por WhatsApp', async ({ page }) => {
  await page.goto('/es?lat=4.53&lon=-75.64&z=12&field=pt:-75.64,4.53');
  await waitForGlobe(page);

  // En "peek" solo se ven el nombre y "Analizar"; al analizar, el sheet sube y aparece "Publicar mi finca".
  await page.getByRole('button', { name: 'Analizar esta finca' }).tap();
  await page.getByRole('button', { name: /Publicar mi finca/ }).first().tap();
  const dialog = page.getByRole('dialog', { name: '¿Qué vendes?' });
  await expect(dialog).toBeVisible();
  // Referencia mayorista de la central más cercana (seed SIPSA).
  await expect(dialog).toContainText('Referencia mayorista en Armenia');
  await dialog.getByLabel(/Precio por/).fill('18000');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).tap();

  const contact = page.getByRole('dialog', { name: 'Contacto y privacidad' });
  await contact.getByLabel('Nombre de la finca').fill('Finca E2E');
  await contact.getByLabel('Tu celular con WhatsApp').fill('300 123 4567');
  await expect(contact.getByLabel('Nombre de la finca')).toHaveValue('Finca E2E');
  await expect(contact.getByLabel('Tu celular con WhatsApp')).toHaveValue('300 123 4567');
  // Sin consentimiento no avanza.
  await page.getByRole('button', { name: 'Siguiente', exact: true }).tap();
  await expect(contact.getByRole('alert')).toContainText('Necesitamos tu permiso');
  await contact.getByRole('checkbox', { name: /Acepto que Field Shift/ }).check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).tap();

  await expect(page.getByRole('dialog', { name: 'Revisa y publica' })).toContainText('Finca E2E');
  await page.getByRole('button', { name: 'Publicar', exact: true }).tap();
  const done = page.getByRole('dialog', { name: '¡Tu finca está publicada!' });
  await expect(done).toBeVisible();
  const href = await done.getByRole('link', { name: 'Ver mi publicación' }).getAttribute('href');
  expect(href).toMatch(/^\/es\/fincas\/[A-Za-z0-9]{10}$/);
  const id = href!.split('/').at(-1)!;

  // Al cerrar: la capa queda visible y se abre la tarjeta de la publicación.
  await done.getByRole('button', { name: 'Cerrar' }).first().tap();
  const card = page.getByRole('dialog', { name: 'Finca E2E' });
  await expect(card).toContainText('Calarcá, Quindío');
  await expect(card).not.toContainText('300');
  await expect(page.getByRole('button', { name: /Mi publicación/ })).toBeVisible();

  // El teléfono solo aparece en la redirección a WhatsApp.
  const res = await page.request.get(`/api/listings/${id}/contact?locale=es`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);

  // Página pública: sin teléfono, con el comparador de la zona aproximada (foto y verdor NASA).
  await page.goto(href!);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finca E2E');
  const slider = page.getByRole('slider', { name: 'Comparar 2016 y 2025' });
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('button', { name: 'Verdor NASA' }).tap();
  await expect(page.getByRole('img', { name: /Verdor de la zona \(NASA MODIS NDVI\)/ }).first()).toBeVisible();
  expect(await page.content()).not.toContain('3001234567');
});

test('fincas que venden: la capa muestra los ejemplos y un toque abre su tarjeta sin contacto real', async ({ page }) => {
  await page.goto('/es?lat=4.55&lon=-75.62&z=9&shop=1');
  await waitForGlobe(page);
  await page.waitForFunction(() => (window as W).__fieldShiftMap!.queryRenderedFeatures({ layers: ['listings'] }).length >= 1);
  const pt = await page.evaluate(() => {
    const m = (window as W).__fieldShiftMap!;
    // Ejemplo "Finca La Esperanza" (Calarcá): centro de su celda pública.
    const p = m.project([-75.625, 4.525]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  });
  await page.touchscreen.tap(pt.x, pt.y);
  const card = page.getByRole('dialog', { name: 'Finca La Esperanza' });
  await expect(card).toContainText('Ejemplo');
  await expect(card).toContainText('no tiene contacto real');
  await expect(card.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0);
  // No abre la región debajo.
  await expect(page.locator('#region-title')).toHaveCount(0);
});
