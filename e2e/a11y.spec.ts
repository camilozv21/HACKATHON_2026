import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

/** Falla solo con problemas críticos o serios (el criterio de la Fase 10: axe sin errores críticos). */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // El canvas del mapa es decorativo (aria-hidden) y tiene alternativa textual; los controles de MapLibre son de terceros.
    .exclude('.maplibregl-ctrl-attrib')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodo(s) — ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

test('accesibilidad: inicio, introducción, panel de la finca, opciones, modo sol y glosario', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && /hydrat/i.test(m.text()) && errors.push(m.text()));

  // Primera visita (sin la marca de bienvenida vista): bienvenida con voz, preguntas de rol y sugerencia.
  await context.clearCookies();
  await page.goto('/es');
  await page.evaluate(() => localStorage.removeItem('fieldshift:onboarded:v2'));
  await page.reload();
  await waitForGlobe(page);
  const intro = page.getByRole('dialog', { name: 'Hola, te damos la bienvenida' });
  await expect(intro).toBeVisible();
  await expectNoSeriousViolations(page, 'bienvenida');
  await intro.getByRole('button', { name: 'Empezar', exact: true }).tap();
  const quiz = page.getByRole('dialog', { name: '¿Quién eres?' });
  await expect(quiz).toBeVisible();
  await expect(intro).toBeHidden();
  await expectNoSeriousViolations(page, 'pregunta de inicio');
  await quiz.getByText('Agricultor o agricultora').tap();
  await quiz.getByRole('button', { name: 'Siguiente' }).tap();
  await page.getByRole('dialog', { name: '¿Qué quieres hacer hoy?' }).getByText('Escoger qué sembrar').tap();
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  // "Leer todo con detalle": modo completo, para que el resto de esta prueba vea la app de siempre.
  await page.getByText('Leer todo con detalle').tap();
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  const suggestion = page.getByRole('dialog', { name: 'Así te mostramos la app' });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByText('Modo completo')).toBeVisible();
  await expectNoSeriousViolations(page, 'sugerencia de inicio');
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();
  await expect(suggestion).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  await expectNoSeriousViolations(page, 'inicio');

  // Recarga: la bienvenida ya no aparece.
  await page.reload();
  await waitForGlobe(page);
  await expect(page.getByRole('dialog', { name: 'Hola, te damos la bienvenida' })).toBeHidden();

  // Alternativa textual al globo: el primer Tab llega al enlace "saltar a la lista de lugares".
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Saltar a la lista de lugares/ })).toBeFocused();

  await page.goto('/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=conditions');
  await waitForGlobe(page);
  await expect(page.getByRole('heading', { name: 'Resumen de tu finca' })).toBeVisible();
  await expectNoSeriousViolations(page, 'panel de la finca');

  await page.getByRole('tab', { name: 'Opciones' }).tap();
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();
  await expectNoSeriousViolations(page, 'opciones de rotación');

  // Modo sol desde Ajustes (sin el sheet abierto: mientras está abierto, el resto queda oculto al lector de pantalla).
  await page.goto('/es?lat=42&lon=-93.5&z=6');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Ajustes' }).tap();
  await page.getByRole('dialog', { name: 'Ajustes' }).getByText('Activado').tap();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expectNoSeriousViolations(page, 'ajustes en modo sol');
  await page.keyboard.press('Escape');

  // Se recuerda al recargar: el panel de la finca y las opciones en modo sol.
  await page.goto('/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=rotations');
  await waitForGlobe(page);
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.getByRole('heading', { name: 'Opciones de rotación para tu finca' })).toBeVisible();
  await expectNoSeriousViolations(page, 'opciones en modo sol');

  await page.goto('/es/glossary');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.getByRole('heading', { name: 'Glosario', level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page, 'glosario (modo sol)');
  // La introducción se arma antes de hidratar: no debe provocar errores de hidratación.
  expect(errors).toEqual([]);
});
