import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Datos fijos: NASA POWER (mensual real de Quindío + un mayo inventado con 10 días secos) y emergencias.
const monthly = JSON.parse(readFileSync('tests/fixtures/power-monthly-quindio.json', 'utf8'));
const days = Array.from({ length: 31 }, (_, i) => `202505${String(i + 1).padStart(2, '0')}`);
const series = (f: (i: number) => number) => Object.fromEntries(days.map((d, i) => [d, f(i)]));
const daily = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-75.6, 4.6, 1800] },
  properties: {
    parameter: {
      PRECTOTCORR: series((i) => (i < 10 ? 0 : i === 20 ? 32 : 4)),
      T2M_MAX: series(() => 24),
      T2M_MIN: series(() => 13),
      T2M: series(() => 18.4),
      GWETROOT: series(() => 0.62),
    },
  },
  header: { fill_value: -999 },
};
const landslide = {
  id: 'ungrd-test-r',
  source: 'ungrd',
  kind: 'landslide',
  title: 'Movimiento en Masa',
  date: '2025-05-02',
  lat: 4.6372,
  lon: -75.5708,
  place: 'Salento, Quindío',
  approx: true,
  url: 'https://www.datos.gov.co/d/2343-nuqp',
  verified: true,
  impact: { people: 4 },
  magnitude: null,
  note: null,
};

test.beforeEach(async ({ page }) => {
  await page.route('https://power.larc.nasa.gov/api/temporal/monthly/point**', (r) => r.fulfill({ json: monthly }));
  await page.route('https://power.larc.nasa.gov/api/temporal/daily/point**', (r) => r.fulfill({ json: daily }));
  await page.route('**/api/events?**', (r) =>
    r.fulfill({ json: { from: '2025-05-01', to: '2025-05-31', sources: [{ id: 'ungrd', status: 'ok', count: 1, latest: '2025-12-31' }], events: [landslide] } }),
  );
  await page.route('**/api/events/history?**', (r) =>
    r.fulfill({
      json: {
        place: { code: '63690', name: 'Salento', dept: 'Quindío', distanceKm: 0 },
        years: { from: 2019, to: 2025 },
        total: 37,
        byKind: [{ kind: 'landslide', count: 16 }],
        recent: [landslide],
        nearby: [],
        status: 'ok',
      },
    }),
  );
});

test('informe agroclimático: resumen contra lo normal, eventos, emergencias cercanas, CSV e impresión', async ({ page }) => {
  await page.goto('/es/report?lat=4.6372&lon=-75.5708&name=Salento%2C%20Quind%C3%ADo&t=2025-05');
  await expect(page.getByRole('heading', { level: 1, name: 'Informe agroclimático' })).toBeVisible();
  await expect(page.getByText('mayo de 2025', { exact: false }).first()).toBeVisible();

  // 21 días × 4 mm + 28 mm extra = 112 mm, con una racha seca de 10 días y una lluvia fuerte.
  await expect(page.getByText(/Llovieron 112 mm en 21 días con lluvia/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Racha seca', { exact: true })).toBeVisible();
  await expect(page.getByText('Lluvia fuerte', { exact: true })).toBeVisible();
  await expect(page.getByText(/Deslizamiento · 2 may 2025 · Salento, Quindío · UNGRD Colombia · 4 personas afectadas/)).toBeVisible();
  await expect(page.getByText(/Historial oficial de la UNGRD en Salento, Quindío: 37 emergencias/)).toBeVisible();
  await expect(page.getByText(/Temperatura media 18 °C \(lo normal: \d+ °C\)\. Máxima promedio 24 °C y mínima promedio 13 °C\./)).toBeVisible();
  await expect(page.getByText(/Lluvia por debajo de lo normal o racha seca/)).toBeVisible();
  await expect(page.getByRole('table')).toContainText('31 may');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);

  // CSV con punto y coma y coma decimal (Excel en español).
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar datos (CSV)' }).tap()]);
  expect(download.suggestedFilename()).toMatch(/^informe-agroclimatico_4\.64_-75\.57_2025-05-01_2025-05-31\.csv$/);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain('fecha;lluvia_mm;lluvia_normal_mm;temp_media_c;temp_media_normal_c;temp_max_c;temp_min_c;humedad_suelo_raices_pct');
  expect(csv).toContain('2025-05-21;32,0;');

  // En papel no salen los botones.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeHidden();
});

test('el agente prepara el informe y el chat muestra el botón para abrirlo', async ({ page }) => {
  await page.goto('/es?lat=4.6&lon=-75.6&z=8');
  await page.waitForFunction(() => (window as Window & { __fieldShiftMap?: { loaded(): boolean } }).__fieldShiftMap?.loaded(), null, {
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  await page.getByRole('textbox', { name: 'Tu pregunta' }).fill('Genera un informe agroclimático de mayo de 2025 de esta zona');
  await page.getByRole('button', { name: 'Enviar pregunta' }).tap();
  const link = page.getByRole('link', { name: 'Abrir el informe' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute('href', /\/es\/report\?lat=.*&lon=.*&t=2025-05/);
});

test('el drawer de región ofrece "Generar informe" con la zona y la fecha que se revisa', async ({ page }) => {
  await page.goto('/es?lat=4.6&lon=-75.6&z=8&region=4.6372,-75.5708&t=2025-05');
  const link = page.getByRole('link', { name: 'Generar informe' });
  await expect(link).toBeVisible({ timeout: 45_000 });
  await expect(link).toHaveAttribute('href', /^\/es\/report\?lat=4\.6372&lon=-75\.5708.*&t=2025-05$/);
  await expect(link).toHaveAttribute('target', '_blank');
});
