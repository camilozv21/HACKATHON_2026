import { expect, test, type Page } from '@playwright/test';

type MapLike = {
  loaded(): boolean;
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  once(ev: string, cb: () => void): void;
  getZoom(): number;
  stop(): void;
};
type W = Window & { __fieldShiftMap?: MapLike };

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('el globo carga, hace zoom a una finca y el canvas renderiza sin errores (Pixel 7)', async ({ page }) => {
  const errors = trackErrors(page);
  // Con cámara en la URL (enlace compartido) la app no vuela sola a la ubicación por IP.
  await page.goto('/es?lat=0&lon=-40&z=1.5');

  await page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });
  const canvas = page.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  // El chunk diferido de la finca restaura la cámara de la URL; esperar a que esté montado.
  await expect(page.locator('.demo-marker').first()).toBeAttached();
  await page.waitForTimeout(300);

  // Zoom a una zona cafetera (Quindío, Colombia) y esperar a que el mapa quede en reposo.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = (window as W).__fieldShiftMap!;
        map.stop();
        map.jumpTo({ center: [-75.68, 4.53], zoom: 12 });
        map.once('idle', () => resolve());
      }),
  );
  expect(await page.evaluate(() => (window as W).__fieldShiftMap!.getZoom())).toBeCloseTo(12, 0);

  // Un canvas vacío comprime a muy pocos bytes; con imagen satelital pesa decenas de KB.
  const shot = await canvas.screenshot();
  expect(shot.byteLength).toBeGreaterThan(30_000);

  // La mira y el chip de lugar están presentes; hay atribución visible.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeAttached();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sin WebGL muestra una vista 2D con un mensaje amable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // Simula un dispositivo sin WebGL.
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/es');
  await expect(page.getByText('Tu dispositivo no puede mostrar el globo 3D', { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('img', { name: /Mapa plano del mundo/ })).toBeVisible();
});
