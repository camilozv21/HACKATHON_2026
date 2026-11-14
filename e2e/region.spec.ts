import { expect, test, type Page } from '@playwright/test';

type W = Window & {
  __fieldShiftMap?: {
    loaded(): boolean;
    project(ll: [number, number]): { x: number; y: number };
    getCanvas(): HTMLCanvasElement;
    isMoving(): boolean;
    getCenter(): { lng: number; lat: number };
    getSource(id: string): { getData(): Promise<GeoJSON.FeatureCollection> } | undefined;
  };
};

/** Espera a que la cámara esté quieta en el punto (el vuelo a la posición de la URL termina después de `loaded()`). */
async function waitForCameraAt(page: Page, lng: number, lat: number) {
  await page.waitForFunction(
    ([x, y]) => {
      const m = (window as W).__fieldShiftMap;
      if (!m?.loaded() || m.isMoving()) return false;
      const c = m.getCenter();
      return Math.abs(c.lng - x!) < 0.05 && Math.abs(c.lat - y!) < 0.05;
    },
    [lng, lat],
    { timeout: 45_000 },
  );
}

async function tapAt(page: Page, lng: number, lat: number) {
  const pt = await page.evaluate(
    ([x, y]) => {
      const m = (window as W).__fieldShiftMap!;
      const p = m.project([x!, y!]);
      const r = m.getCanvas().getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    },
    [lng, lat],
  );
  await page.touchscreen.tap(pt.x, pt.y);
}

test('tocar un punto demo abre el drawer de región con sensores NASA; Esc lo cierra', async ({ page }) => {
  await page.goto('/es?lat=25&lon=70&z=2.5');
  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

  await page.locator('.demo-marker[aria-label*="Punjab"]').click();
  const drawer = page.getByRole('dialog', { name: 'Punjab, India' });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/region=demo(%3A|:)punjab-ludhiana/);

  // Tarjetas en el orden pedido, cada una con fuente y botón "ver en el mapa".
  await expect(drawer.getByRole('heading', { name: 'Humedad del suelo' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Agua subterránea' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Alertas para esta región' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Ver en el mapa' }).first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/region=/);
});

test('en Colombia, tocar el mapa elige el municipio: nombre, tipo y enlace co:<DIVIPOLA>', async ({
  page,
}) => {
  await page.goto('/es?lat=6.2555&lon=-75.6231&z=9');
  await waitForCameraAt(page, -75.6231, 6.2555);
  // Punto interior de Medellín (DIVIPOLA 05001). Si los límites aún no llegaron, el drawer abre el punto y luego
  // pasa al municipio.
  await tapAt(page, -75.6231, 6.2555);

  const drawer = page.getByRole('dialog', { name: 'Medellín, Antioquia' });
  await expect(drawer).toBeVisible({ timeout: 15_000 });
  await expect(drawer.getByText('Municipio · datos NASA')).toBeVisible();
  await expect(page).toHaveURL(/region=co(%3A|:)05001/);
});

test('?region=co:05 abre el departamento de Antioquia', async ({ page }) => {
  await page.goto('/es?region=co:05');
  const drawer = page.getByRole('dialog', { name: 'Antioquia' });
  await expect(drawer).toBeVisible({ timeout: 45_000 });
  await expect(drawer.getByText('Departamento · datos NASA')).toBeVisible();
});

test('un municipio pequeño se ve junto a su departamento y al recuadro de los datos', async ({ page }) => {
  await page.goto('/es?lat=6.1382&lon=-75.6534&z=11');
  await waitForCameraAt(page, -75.6534, 6.1382);
  await tapAt(page, -75.6534, 6.1382); // La Estrella (05380)

  const drawer = page.getByRole('dialog', { name: 'La Estrella, Antioquia' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Municipio: La Estrella')).toBeVisible();
  await expect(drawer.getByText('Departamento: Antioquia')).toBeVisible();
  await expect(drawer.getByText(/Cuadro punteado: zona de los datos, unos \d+ km/)).toBeVisible();

  // En el mapa: el departamento entero y el recuadro, además del borde del municipio.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const data = await (window as W).__fieldShiftMap!.getSource('region-context')!.getData();
        return data.features.map((f) => f.properties?.kind).sort();
      }),
    )
    .toEqual(['cell', 'dpto']);
});
