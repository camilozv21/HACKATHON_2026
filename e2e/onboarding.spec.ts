import { expect, test, type Page } from '@playwright/test';

/**
 * Preguntas de inicio por rol, modo sencillo y locutor. Los e2e corren con AGENT_FORCE_MOCK=true: /api/profile
 * responde con las reglas locales ("Sugerencia automática"), sin gastar la clave de Claude.
 */
type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

async function firstVisit(page: Page) {
  await page.goto('/es');
  await page.evaluate(() => {
    localStorage.removeItem('fieldshift:onboarded:v2');
    localStorage.removeItem('fieldshift:mode');
    localStorage.removeItem('fieldshift:narrator');
    localStorage.removeItem('fieldshift:profile:v1');
  });
  await page.reload();
  await waitForGlobe(page);
  const welcome = page.getByRole('dialog', { name: 'Hola, te damos la bienvenida' });
  await expect(welcome).toBeVisible();
  return welcome;
}

async function answer(page: Page, choices: [string, string, string]) {
  for (const choice of choices) {
    await page.getByText(choice, { exact: true }).tap();
    await page.getByRole('button', { name: 'Siguiente' }).tap();
  }
}

test('agricultor que prefiere escuchar: modo sencillo con voz y el panel de su zona', async ({ page }) => {
  const welcome = await firstVisit(page);
  // El botón del locutor está en la bienvenida (antes de leer nada).
  await expect(welcome.getByRole('button', { name: 'Escuchar con voz' })).toBeVisible();
  await welcome.getByRole('button', { name: 'Empezar', exact: true }).tap();

  await expect(page.getByRole('dialog', { name: '¿Quién eres?' })).toBeVisible();
  await expect(page.getByText('1 de 3')).toBeVisible();
  await answer(page, ['Agricultor o agricultora', 'Ver el clima de mi zona', 'Escucharla']);

  const suggestion = page.getByRole('dialog', { name: 'Así te mostramos la app' });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByText('Sugerencia automática')).toBeVisible();
  await expect(suggestion.getByText('Modo sencillo')).toBeVisible();
  await expect(suggestion.getByRole('switch', { name: /Voz que lee en voz alta/ })).toHaveAttribute('aria-checked', 'true');
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'lite');
  expect(await page.evaluate(() => localStorage.getItem('fieldshift:narrator'))).toBe('1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fieldshift:profile:v1') ?? '{}').role)).toBe('farmer');

  // Primer paso: el panel de condiciones de su zona, en versión sencilla.
  const drawer = page.locator('aside[aria-labelledby="region-title"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Humedad del suelo' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Escuchar el resumen' }).or(drawer.getByRole('button', { name: 'Detener' }))).toBeVisible();
  // Lo técnico queda oculto: coordenadas y "misión · fecha · resolución"; el resto de tarjetas tras "Ver más datos".
  await expect(drawer.locator('p.font-mono')).toBeHidden();
  await expect(drawer.getByRole('heading', { name: 'Agua subterránea' })).toBeHidden();
  await drawer.getByRole('button', { name: /Ver más datos/ }).tap();
  await expect(drawer.getByRole('heading', { name: 'Agua subterránea' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Cerrar región' }).tap();

  // Ajustes → Completo devuelve todo el detalle (y se recuerda al recargar).
  await page.getByRole('button', { name: 'Ajustes' }).tap();
  const settings = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(settings.getByText('Agricultor o agricultora')).toBeVisible();
  await settings.getByText('Completo', { exact: true }).tap();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  await page.keyboard.press('Escape');
  await page.reload();
  await waitForGlobe(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
});

test('técnico que quiere ver satélites: modo completo y el catálogo de capas', async ({ page }) => {
  const welcome = await firstVisit(page);
  await welcome.getByRole('button', { name: 'Empezar', exact: true }).tap();
  await answer(page, ['Técnico o técnica', 'Ver datos de satélite', 'Leer poco']);
  const suggestion = page.getByRole('dialog', { name: 'Así te mostramos la app' });
  await expect(suggestion.getByText('Modo completo')).toBeVisible();
  // La persona puede cambiar la sugerencia antes de aceptarla.
  await suggestion.getByRole('button', { name: 'Prefiero el modo sencillo' }).tap();
  await expect(suggestion.getByText('Modo sencillo')).toBeVisible();
  await suggestion.getByRole('button', { name: 'Prefiero el modo completo' }).tap();
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  await expect(page.getByRole('dialog', { name: 'Capas de datos NASA' })).toBeVisible();
});

test('saltar la bienvenida deja la app como siempre', async ({ page }) => {
  const welcome = await firstVisit(page);
  await welcome.getByRole('button', { name: 'Saltar' }).tap();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole('dialog', { name: '¿Quién eres?' })).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  expect(await page.evaluate(() => localStorage.getItem('fieldshift:onboarded:v2'))).toBe('1');
});

test('el agente recibe el perfil para adaptar sus respuestas', async ({ page }) => {
  await page.goto('/es');
  await page.evaluate(() => {
    localStorage.setItem('fieldshift:mode', 'lite');
    localStorage.setItem(
      'fieldshift:profile:v1',
      JSON.stringify({ role: 'farmer', goal: 'climate', reading: 'little', suggestions: ['¿Cómo está la lluvia en mi zona?'], source: 'rules' }),
    );
  });
  await page.reload();
  await waitForGlobe(page);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'lite');
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/agent') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  // Las preguntas para empezar son las que sugirió el perfil.
  await page.getByRole('button', { name: '¿Cómo está la lluvia en mi zona?' }).tap();
  const body = (await sent).postDataJSON() as { profile?: { role?: string; mode?: string; narrator?: boolean } };
  expect(body.profile).toEqual({ role: 'farmer', mode: 'lite', narrator: false });
});
