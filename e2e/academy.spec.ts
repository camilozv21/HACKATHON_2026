import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * AgroAcademy (/es/academy): una lección completa con el simulador del teléfono (tocar lo que brilla, con roles
 * accesibles), la pregunta, "Pruébalo en el globo", el avance guardado, un reto de práctica y el acceso desde Ajustes.
 */
type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

async function noSeriousViolations(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

test('una lección con el simulador, la pregunta y el avance guardado', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/es/academy');
  await page.evaluate(() => localStorage.removeItem('fieldshift:academy:v1'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'AgroAcademy' })).toBeVisible();
  await expect(page.getByText('0 de 23 actividades hechas')).toBeVisible();
  await noSeriousViolations(page, 'academia');

  await page.getByRole('button', { name: 'Empezar la primera lección' }).tap();
  const lesson = page.getByRole('dialog', { name: 'El globo y la mira' });
  await expect(lesson).toBeVisible();
  await expect(lesson.getByText('Paso 1 de 4')).toBeVisible();
  await noSeriousViolations(page, 'lección');

  // Simulador: solo lo que brilla es un botón, y su nombre es la instrucción.
  const sim = lesson.getByRole('group', { name: /Teléfono de ejemplo/ });
  for (const step of [
    'Toca el globo para acercarte a tu zona.',
    'La mira del centro marca el lugar que miras. Tócala.',
    '¿Prefieres escribir? Toca la lupa de arriba.',
  ])
    await sim.getByRole('button', { name: step }).tap();
  await sim.getByRole('button', { name: /Armenia, Quindío/ }).tap();

  // Pregunta: una equivocada (explica y deja intentar) y la correcta.
  await expect(lesson.getByText('¿Qué marca la mira del centro del globo?')).toBeVisible();
  await lesson.getByRole('button', { name: 'Dónde está lloviendo ahora' }).tap();
  await expect(lesson.getByText(/Casi\./)).toBeVisible();
  await lesson.getByRole('button', { name: 'El lugar que estás mirando' }).tap();
  await expect(lesson.getByText('¡Lección completa!')).toBeVisible();
  await expect(lesson.getByRole('link', { name: 'Pruébalo en el globo' })).toHaveAttribute('href', '/es?lat=4.53&lon=-75.68&z=6');

  // Siguiente lección y cerrar: el avance queda guardado al recargar.
  await lesson.getByRole('button', { name: 'Siguiente lección' }).tap();
  await expect(page.getByRole('dialog', { name: 'Tu ubicación' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('1 de 23 actividades hechas')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 de 23 actividades hechas')).toBeVisible();
  await expect(page.getByRole('button', { name: /El globo y la mira/ })).toContainText('Hecha');
});

test('practicar un reto del glosario guarda la mejor marca', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/es/academy');
  await page.evaluate(() => localStorage.removeItem('fieldshift:academy:v1'));
  await page.reload();
  await page.getByRole('button', { name: 'Visión satélite. Sin jugar' }).tap();
  const game = page.getByRole('dialog', { name: 'Visión satélite' });
  await expect(game).toBeVisible();
  await game.getByRole('button', { name: 'Visión satélite' }).tap();
  for (const n of [3, 7, 9]) await game.getByRole('button', { name: new RegExp(`^Lote ${n}, verdor`) }).tap();
  await expect(game.getByRole('img', { name: '3 estrellas de 3' })).toBeVisible();
  await game.getByRole('button', { name: 'Volver a la AgroAcademy' }).tap();
  await expect(page.getByRole('button', { name: 'Visión satélite. Mejor marca: 3 estrellas' })).toBeVisible();
  await expect(page.getByRole('img', { name: '3 de 21 estrellas en la práctica' })).toBeVisible();
});

test('Ajustes lleva a la AgroAcademy', async ({ page }) => {
  await page.goto('/es');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Ajustes' }).tap();
  await expect(page.getByRole('dialog', { name: 'Ajustes' }).getByRole('link', { name: 'AgroAcademy: aprende a usar la app' })).toHaveAttribute(
    'href',
    '/es/academy',
  );
});
