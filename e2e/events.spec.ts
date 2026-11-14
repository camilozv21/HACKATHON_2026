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

const base = { approx: true, impact: null, magnitude: null, note: null, place: null, url: null };
const today = new Date().toISOString().slice(0, 10);
// Datos fijos: la prueba no depende de NASA EONET ni de datos.gov.co.
const EVENTS = {
  from: '2026-01-01',
  to: today,
  sources: [
    { id: 'eonet', status: 'ok', count: 1, latest: null },
    { id: 'ungrd', status: 'not-yet', count: 0, latest: '2025-12-31' },
    { id: 'community', status: 'ok', count: 1, latest: null },
  ],
  events: [
    {
      ...base,
      id: 'ungrd-test-1',
      source: 'ungrd',
      kind: 'landslide',
      title: 'Movimiento en Masa',
      date: today,
      lat: 4.6372,
      lon: -75.5708,
      place: 'Salento, Quindío',
      url: 'https://www.datos.gov.co/d/2343-nuqp',
      verified: true,
      impact: { people: 4, families: 1 },
    },
    { ...base, id: 'EONET_TEST', source: 'eonet', kind: 'flood', title: 'Flood in Colombia', date: today, lat: 5.2, lon: -74.2, approx: false, verified: true },
    {
      ...base,
      id: 'community-test-1',
      source: 'community',
      kind: 'flood',
      title: 'Creciente',
      date: today,
      lat: 4.2,
      lon: -76.1,
      verified: false,
      note: 'La quebrada se salió.',
      impacts: ['water'],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/events?**', (r) => r.fulfill({ json: EVENTS }));
});

test('eventos: se ven en el globo, un toque abre el detalle con su fuente y la lista filtra por fuente', async ({ page }) => {
  await page.goto('/es?lat=4.8&lon=-75.3&z=6.5&ev=1');
  await waitForGlobe(page);
  const chip = page.getByRole('button', { name: /Ver la lista de eventos/ });
  await expect(chip).toContainText('3 eventos · últimos 90 días');

  // Toque sobre el deslizamiento de UNGRD (no abre la región).
  await page.waitForFunction(() => (window as W).__fieldShiftMap!.queryRenderedFeatures({ layers: ['hazard-events'] }).length >= 2);
  const pt = await page.evaluate(() => {
    const m = (window as W).__fieldShiftMap!;
    const p = m.project([-75.5708, 4.6372]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  });
  await page.touchscreen.tap(pt.x, pt.y);
  const card = page.getByRole('dialog', { name: 'Deslizamiento' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Registro oficial UNGRD');
  await expect(card).toContainText('Salento, Quindío');
  await expect(card).toContainText('4 personas afectadas');
  await expect(page.locator('#region-title')).toHaveCount(0);
  await card.getByRole('button', { name: 'Cerrar' }).tap();

  // Lista: fuentes con su estado y el aviso del retraso de UNGRD.
  await chip.tap();
  const sheet = page.getByRole('dialog', { name: 'Eventos y emergencias' });
  await expect(sheet).toContainText('La UNGRD publica sus registros con retraso');
  await sheet.getByRole('switch', { name: /Comunidad/ }).tap();
  await expect(chip).toContainText('2 eventos');
  await sheet.getByRole('switch', { name: /Comunidad/ }).tap();
  await expect(chip).toContainText('3 eventos');
});

test('reportar un evento: sin datos personales, queda "sin verificar" en el mapa', async ({ page }) => {
  await page.goto('/es?lat=4.6&lon=-75.6&z=8');
  await waitForGlobe(page);
  await page.getByRole('button', { name: /capas/i }).tap();
  await page.getByRole('button', { name: 'Reportar un evento' }).tap();

  const form = page.getByRole('dialog', { name: 'Reportar un evento' });
  await expect(form).toContainText('Llama ya al 123');
  await form.getByText('Deslizamiento', { exact: true }).tap();
  await form.getByText('Vías', { exact: true }).tap();
  await form.getByRole('textbox').fill('Tapó la vía. Llamen al 312 555 1234');
  await form.getByRole('button', { name: 'Enviar reporte' }).tap();

  await expect(page.getByText(/Gracias. Tu reporte ya está en el mapa/)).toBeVisible();
  const card = page.getByRole('dialog', { name: 'Deslizamiento' });
  await expect(card).toContainText('Sin verificar');
  // El teléfono no se guarda.
  await expect(card).toContainText('Tapó la vía. Llamen al […]');
  await expect(card).not.toContainText('312');
});
