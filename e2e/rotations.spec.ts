import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };

const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('comparar rotaciones: lo de hoy + 3 opciones, detalle con evidencia en el mapa, ¿y si…?, tabla e impresión', async ({ page, context }) => {
  // Un enlace con view=rotations abre directo en las opciones de la finca.
  await page.goto('/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=rotations');
  await waitForGlobe(page);
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();

  const slides = page.locator('ul[aria-label="Opciones de rotación"] > li');
  await expect(slides).toHaveCount(4);
  await expect(slides.filter({ hasText: 'Lo que haces hoy' })).toHaveCount(1);
  await expect(slides.first()).toContainText('de 100');

  // Detalle: secciones plegables y "ver en el mapa" activa la capa NASA de la evidencia.
  // La mejora de lo de hoy: los mismos cultivos con una cobertura en el hueco del invierno.
  await page.getByRole('button', { name: /Ver detalle de Maíz – soya con .+ de cobertura/ }).tap();
  await expect(page.getByRole('button', { name: 'Volver a las opciones' })).toBeVisible();
  await expect(page.getByText('Riesgos y qué revisar con un experto')).toBeVisible();
  await expect(page.getByText('Revisa con un técnico de tu zona')).toBeVisible();
  await page.getByRole('button', { name: /Ver en el mapa: Humedad del suelo/ }).tap();
  await expect(page).toHaveURL(/layer=soil-moisture/);
  await page.getByRole('button', { name: 'Ver mi finca', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Volver a las opciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a las opciones' }).tap();

  // ¿Y si…? marca los puntajes como estimación.
  await page.getByText('¿Y si cambia el clima?').tap();
  await page.getByRole('slider', { name: 'Lluvia', exact: true }).fill('-30');
  await expect(page.getByText(/es una estimación, no un pronóstico/)).toBeVisible();
  await page.getByRole('button', { name: 'Volver a hoy' }).tap();

  // Tabla lado a lado (diálogo): Esc la cierra a ella, pero no cierra el sheet de la finca.
  await page.getByRole('button', { name: 'Ver tabla' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Comparación lado a lado' });
  await expect(dialog.getByRole('row')).toHaveCount(11);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ver tabla' })).toBeFocused();
  await page.waitForTimeout(700); // lo que dura el cierre del sheet si se hubiera cerrado
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();

  // Resumen imprimible en otra pestaña.
  const [print] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Imprimir' }).tap()]);
  await expect(print.getByRole('heading', { name: 'Resumen de opciones de rotación' })).toBeVisible();
  await expect(print.getByRole('table').getByRole('row')).toHaveCount(5);
  await expect(print.getByText(/Revisa cualquier cambio con tu experiencia/)).toBeVisible();
});

test('la rotación en el tiempo: 10 años por opción, ritmo del cambio, contexto social y fuentes', async ({ page }) => {
  // Finca demo de café en Quindío: dentro de Colombia, así que suma el contexto del país.
  await page.goto('/es?lat=4.53&lon=-75.78&z=12&field=demo:cafe-quindio&view=rotations');
  await waitForGlobe(page);
  const outlook = page.getByRole('region', { name: 'Tu finca en 10 años' });
  await expect(outlook).toBeVisible();
  await expect(outlook.getByRole('group', { name: /de hoy a 10 años, por opción/ })).toBeVisible();

  // Cambiar lo que muestra la gráfica y el ritmo del cambio (pide la proyección de nuevo).
  await outlook.getByRole('radio', { name: 'Suelo perdido' }).tap();
  await expect(outlook.getByRole('radio', { name: 'Suelo perdido' })).toHaveAttribute('aria-checked', 'true');
  await outlook.getByRole('radio', { name: /Poco a poco/ }).tap();

  // Las preguntas a la familia cambian el análisis social; se recuerdan en el teléfono.
  await outlook.getByRole('button', { name: 'Arrendada' }).tap();
  await expect(outlook.getByRole('button', { name: 'Arrendada' })).toHaveAttribute('aria-pressed', 'true');
  await expect(outlook.getByText(/70,4 % de las unidades productivas/)).toBeVisible();

  // Una cita abre la lista de fuentes y lleva el foco a la fuente.
  await outlook.getByRole('button', { name: /Ver la fuente \d+/ }).first().tap();
  await expect(outlook.getByRole('link', { name: /Abrir la fuente/ }).first()).toBeVisible();

  // Detalle de una opción: la rueda del ciclo, los años por fase y el contexto social.
  // Una opción nueva (no la de hoy), para que tenga transición y aviso de tierra arrendada.
  const option = page.locator('ul[aria-label="Opciones de rotación"] > li').filter({ hasNotText: 'Lo que haces hoy' }).first();
  await option.getByRole('button', { name: /^Ver detalle de / }).tap();
  await expect(page.getByText('En el tiempo: 10 años')).toBeVisible();
  await expect(page.getByRole('img', { name: /La rotación como un ciclo/ })).toBeVisible();
  await page.getByText('Contexto social: lo que pide a tu familia').tap();
  await expect(page.getByText('Trabajo mes a mes')).toBeVisible();
  await expect(page.getByText('Tierra arrendada').first()).toBeVisible();
});
