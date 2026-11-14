import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });

test('máquina del tiempo: la finca reconstruye mayo con datos diarios, el selector cambia a un día y vuelve a hoy', async ({ page }) => {
  await page.goto('/es?lat=42&lon=-93.5&z=6&field=demo:cornbelt-iowa&view=conditions&t=2026-05');
  await waitForGlobe(page);

  // El panel de la finca muestra lo que pasó en mayo (NASA POWER diario) con los eventos reconstruidos.
  await expect(page.getByRole('heading', { name: 'Lo que pasó en mayo de 2026' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Lluvia del mes')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('heading', { name: 'Eventos reconstruidos' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Lluvia y temperatura de cada día de mayo de 2026/ })).toBeAttached();
  await expect(page.getByText('Viendo mayo de 2026').first()).toBeVisible();

  // Cambiar a un día desde el panel.
  await page.getByRole('button', { name: 'Cambiar la fecha' }).tap();
  const picker = page.getByRole('dialog', { name: '¿Qué fecha quieres revisar?' });
  await expect(picker).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
  await picker.getByRole('radio', { name: 'Un día' }).tap();
  await picker.getByRole('radio', { name: '14 de mayo de 2026' }).tap();
  await picker.getByRole('button', { name: 'Ver 14 de mayo de 2026' }).tap();
  await expect(picker).toBeHidden();
  await expect(page).toHaveURL(/t=2026-05-14/);
  await expect(page.getByText('Viendo 14 de mayo de 2026').first()).toBeVisible();

  // Volver a hoy quita la fecha de la URL y la sección del pasado.
  await page.getByRole('button', { name: 'Volver a hoy' }).first().tap();
  await expect(page).not.toHaveURL(/t=2026/);
  await expect(page.getByRole('heading', { name: /Lo que pasó en/ })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Revisar una fecha pasada' })).toBeVisible();
});

test('máquina del tiempo: la región y las capas del mapa muestran el mes elegido', async ({ page }) => {
  // Enlace compartido con la región abierta en mayo (el globo gira solo en zoom bajo: abrirla por URL es estable).
  await page.goto('/es?lat=25&lon=70&z=2.5&t=2026-05&region=demo:punjab-ludhiana');
  await waitForGlobe(page);
  const drawer = page.getByRole('dialog', { name: 'Punjab, India' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Datos de mayo de 2026')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Viendo mayo de 2026' })).toBeVisible();

  // Una capa activada mientras se revisa mayo salta a mayo.
  await page.getByRole('button', { name: /Abrir capas de datos NASA/ }).tap();
  await page.getByRole('switch', { name: /Lluvia/ }).tap();
  await expect(page).toHaveURL(/layer=rain/);
  await expect(page).toHaveURL(/ldate=2026-05-15/);
});

test('máquina del tiempo: el agente entiende "¿cómo llovió en mayo?" y mueve la app a esa fecha', async ({ page }) => {
  await page.goto('/es?lat=10&lon=-40&z=2');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  await page.getByRole('textbox', { name: 'Tu pregunta' }).fill('¿Cómo estuvo la lluvia en mayo de 2025 en Iowa?');
  await page.getByRole('button', { name: 'Enviar pregunta' }).tap();
  await expect(page).toHaveURL(/t=2025-05/, { timeout: 20_000 });
  await expect(page).toHaveURL(/layer=rain/);
  await expect(page).toHaveURL(/ldate=2025-05/);
  await expect(page.getByRole('dialog', { name: /Iowa/ }).getByText('Datos de mayo de 2025')).toBeVisible({ timeout: 20_000 });
});
