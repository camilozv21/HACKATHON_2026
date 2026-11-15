import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };

const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

const IOWA = '/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa';

async function openPriorities(page: Page) {
  await page.getByRole('button', { name: 'Generar plan de rotación de cultivos' }).tap();
  // Prioridades ya no tiene pestaña: se abre desde "Opciones", que es lo que ordena.
  await page.getByRole('tab', { name: 'Opciones' }).tap();
  await page.getByRole('button', { name: 'Prioridades', exact: true }).tap();
}

async function setLevels(page: Page, levels: Record<string, 'Mucho' | 'Algo' | 'Poco'>) {
  for (const [name, level] of Object.entries(levels)) {
    await page.getByRole('radiogroup', { name }).getByText(level, { exact: true }).tap();
  }
}

/** Opciones en el orden en que se ven (cada una muestra "N de 100"). */
const options = (page: Page) => page.getByRole('listitem').filter({ hasText: /de 100/ });

test('las prioridades reordenan las opciones en el teléfono y viajan en el enlace', async ({ page }) => {
  let analysisCalls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/mock/analysis')) analysisCalls++;
  });

  await page.goto(IOWA);
  await waitForGlobe(page);
  await openPriorities(page);

  // Ingresos y menos trabajo primero: lo que hace hoy (maíz–soya, sin labores extra) sube al 1.er puesto.
  await setLevels(page, {
    'Ahorrar agua': 'Poco',
    'Mejorar el suelo': 'Poco',
    'Más ingresos': 'Mucho',
    'Forraje para animales': 'Poco',
    'Frenar la erosión': 'Poco',
    'Menos trabajo y maquinaria': 'Mucho',
  });
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await expect(page.getByRole('heading', { name: 'Lo que tienes a mano' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await expect(page.getByRole('heading', { name: 'Revisa y listo' })).toBeVisible();
  await expect(options(page)).toHaveCount(4);
  await expect(options(page).first()).toContainText('Lo que haces hoy');
  const callsAfterFirst = analysisCalls;

  // Frenar la erosión primero: lo de hoy baja al último puesto, sin volver a pedir el análisis.
  await page.getByRole('button', { name: 'Cambiar: Lo que más te importa' }).tap();
  await setLevels(page, { 'Más ingresos': 'Poco', 'Menos trabajo y maquinaria': 'Poco', 'Frenar la erosión': 'Mucho' });
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await expect(options(page).last()).toContainText('Lo que haces hoy');
  expect(analysisCalls).toBe(callsAfterFirst);

  await page.getByText('Así calculamos el orden').tap();
  await expect(page.getByText('Puntaje = suma de (peso × puntaje) ÷ suma de pesos')).toBeVisible();

  await page.getByRole('button', { name: 'Ver opciones de rotación' }).tap();
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();
  await expect(page).toHaveURL(/pr=111151n/);

  // El enlace solo (sin perfil guardado) restaura las prioridades y abre directo en las opciones.
  await expect(page).toHaveURL(/view=rotations/);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForGlobe(page);
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();
  await page.getByRole('button', { name: 'Prioridades', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Revisa y listo' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Frenar la erosión' })).toContainText('Mucho');
  await expect(options(page).last()).toContainText('Lo que haces hoy');
});
