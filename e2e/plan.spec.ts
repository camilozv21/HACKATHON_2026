import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };

const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('tu plan: encuesta del terreno, recomendación con alturas y raíces, detalle y "arma tu mezcla"', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sent: { survey?: { lastCrop?: string } } = {};
  page.on('request', (r) => {
    if (r.url().includes('/api/mock/analysis') && r.method() === 'POST') sent.survey = r.postDataJSON()?.field?.survey;
  });

  // Un enlace con view=plan abre directo en "Tu plan".
  await page.goto('/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=plan');
  await waitForGlobe(page);
  await expect(page.getByRole('tab', { name: 'Tu plan' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Tu plan de siembra' })).toBeVisible();

  // Encuesta: una pregunta por pantalla, todo opcional.
  await page.getByRole('button', { name: 'Responder' }).tap();
  await expect(page.getByRole('heading', { name: '¿Qué sueles sembrar aquí?' })).toBeVisible();
  await page.getByRole('button', { name: 'Maíz', exact: true }).tap();
  await page.getByRole('button', { name: 'Frijol', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Frijol', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Siguiente' }).tap();

  await expect(page.getByRole('heading', { name: '¿Qué sembraste la última vez?' })).toBeVisible();
  await page.getByRole('radiogroup', { name: '¿Qué sembraste la última vez?' }).getByText('Maíz', { exact: true }).tap();
  await page.getByRole('button', { name: 'Siguiente' }).tap();

  await page.getByRole('radiogroup', { name: '¿Abonas o fertilizas este terreno?' }).getByText('No', { exact: true }).tap();
  await page.getByRole('button', { name: 'Saltar' }).tap();
  await page.getByRole('button', { name: 'Saltar' }).tap();
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await page.getByRole('button', { name: 'Guardar respuestas' }).tap();
  await expect(page.getByText('Respuestas guardadas. Ajustamos tu plan.')).toBeVisible();

  // La encuesta viaja al análisis.
  await expect.poll(() => sent.survey?.lastCrop).toBe('maize');

  // Recomendación: cultivo principal, perfil de alturas y raíces, por qué y confianza.
  await expect(page.getByText('Para tu próxima siembra te recomendamos')).toBeVisible();
  await expect(page.getByRole('img', { name: /^Perfil de/ }).first()).toBeVisible();
  await expect(page.getByText(/Confianza (alta|media|baja)/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan de 2 años: asociar y rotar' })).toBeVisible();

  // Detalle: cuándo sembrar cada uno, cómo se llevan y qué revisar con un técnico.
  await page.getByRole('button', { name: 'Ver cómo sembrarlo', exact: true }).first().tap();
  await expect(page.getByRole('button', { name: 'Volver al plan' })).toBeVisible();
  await expect(page.getByText('Cuándo sembrar cada uno')).toBeVisible();
  await expect(page.getByText('Cómo se llevan')).toBeVisible();
  await expect(page.getByText('Revisa con un técnico de tu zona')).toBeVisible();
  await page.getByRole('button', { name: 'Volver al plan' }).tap();

  // Las tres hermanas aparecen entre las asociaciones y su detalle explica cómo sembrarlas.
  await page.getByRole('button', { name: 'Ver cómo sembrar Tres hermanas (milpa)' }).tap();
  await expect(page.getByRole('heading', { name: 'Tres hermanas (milpa)' })).toBeVisible();
  await expect(page.getByText('Tutor: el frijol trepa por el maíz.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Volver al plan' }).tap();

  // Arma tu mezcla: quitar y agregar cultivos recalcula el puntaje.
  const builder = page.getByRole('region', { name: 'Arma tu mezcla' });
  await builder.scrollIntoViewIfNeeded();
  await builder.getByRole('button', { name: 'Agregar cultivo' }).tap();
  await builder.getByPlaceholder('Buscar cultivo').fill('trébol');
  // En la lista, el nombre del botón es el cultivo y si se da aquí ("Trébol se da aquí").
  await builder.getByRole('button', { name: /^Trébol/ }).tap();
  await expect(builder.getByRole('button', { name: 'Quitar Trébol' })).toBeVisible();
  await expect(builder.getByText(/Tu mezcla tiene \d+ de 100/)).toBeAttached();

  expect(errors).toEqual([]);
});
