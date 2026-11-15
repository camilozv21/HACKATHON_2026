import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Inicio tipo juego: personaje, cómo quiere jugar, los 7 retos del glosario, la primera misión, el perfil de campo
 * y la sugerencia de modo. Los e2e corren con AGENT_FORCE_MOCK=true: /api/profile responde con las reglas locales
 * ("Sugerencia automática"), sin gastar la clave de Claude.
 */
type W = Window & { __fieldShiftMap?: { loaded(): boolean } };
const waitForGlobe = (page: Page) =>
  page.waitForFunction(() => (window as W).__fieldShiftMap?.loaded(), null, { timeout: 45_000 });
/** El diálogo del inicio (su nombre cambia en cada pantalla: es el título de la pantalla). */
const quizOf = (page: Page) => page.locator('section[role="dialog"][aria-labelledby="quiz-title"]');

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

/** ¿Quién eres? y ¿Cómo quieres jugar? → empieza el primer reto. */
async function profileQuestions(page: Page, role: string, reading: string) {
  const quiz = quizOf(page);
  await expect(page.getByRole('dialog', { name: '¿Quién eres?' })).toBeVisible();
  await expect(quiz.getByText('1 de 3')).toBeVisible();
  await quiz.getByText(role, { exact: true }).tap();
  await quiz.getByRole('button', { name: 'Siguiente', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '¿Cómo quieres jugar?' })).toBeVisible();
  await quiz.getByText(reading, { exact: true }).tap();
  await quiz.getByRole('button', { name: '¡A jugar!', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Visión satélite' })).toBeVisible();
  await expect(quiz.getByText('Reto 1 de 7')).toBeVisible();
  return quiz;
}

/** Primera misión → perfil de campo → sugerencia de modo. */
async function missionAndProfile(page: Page, goal: string) {
  const quiz = quizOf(page);
  await expect(page.getByRole('dialog', { name: '¿Cuál es tu primera misión?' })).toBeVisible();
  await quiz.getByText(goal, { exact: true }).tap();
  await quiz.getByRole('button', { name: 'Siguiente', exact: true }).tap();
  await expect(quiz.getByText('Tu perfil de campo')).toBeVisible();
  await quiz.getByRole('button', { name: 'Ver cómo queda mi app' }).tap();
  const suggestion = page.getByRole('dialog', { name: 'Así te mostramos la app' });
  await expect(suggestion).toBeVisible();
  return suggestion;
}

const nextChallenge = (quiz: Locator) => quiz.getByRole('button', { name: 'Siguiente reto' }).tap();
const pick = (quiz: Locator, group: string, option: string) => quiz.getByRole('group', { name: group }).getByText(option, { exact: true }).tap();

/** Juega los 7 retos sin un error (3 estrellas en cada uno), solo con roles y nombres accesibles. */
async function playAllPerfectly(page: Page) {
  const quiz = quizOf(page);

  // 1 · Visión satélite: encender el NDVI y tocar los 3 lotes con estrés.
  await quiz.getByRole('button', { name: 'Visión satélite' }).tap();
  for (const n of [3, 7, 9]) await quiz.getByRole('button', { name: new RegExp(`^Lote ${n}, verdor`) }).tap();
  await expect(quiz.getByRole('heading', { name: 'NDVI (verdor)' })).toBeVisible();
  await expect(quiz.getByRole('img', { name: '3 estrellas de 3' })).toBeVisible();
  await nextChallenge(quiz);

  // 2 · El campo suda: las dos fuentes de vapor, el día que más agua saca y, al final, cubrir el suelo.
  await expect(page.getByRole('dialog', { name: 'El campo suda' })).toBeVisible();
  await quiz.getByRole('button', { name: 'El suelo' }).tap();
  await quiz.getByRole('button', { name: 'Las hojas' }).tap();
  await expect(quiz.getByText('Evapotranspiración', { exact: true })).toBeVisible();
  await quiz.getByRole('button', { name: 'Seguir', exact: true }).tap();
  await pick(quiz, 'Sol', 'Fuerte');
  await pick(quiz, 'Viento', 'Fuerte');
  await pick(quiz, 'Suelo', 'Desnudo');
  await expect(quiz.getByText(/al día! Con sol fuerte/)).toBeVisible();
  await pick(quiz, 'Suelo', 'Cubierto');
  await expect(quiz.getByRole('heading', { name: 'Evapotranspiración' })).toBeVisible();
  await nextChallenge(quiz);

  // 3 · La cuenta del agua: mes seco (regar 80) y mes de lluvias (no regar).
  await expect(page.getByRole('dialog', { name: 'La cuenta del agua' })).toBeVisible();
  for (let i = 0; i < 4; i++) await quiz.getByRole('button', { name: 'Regar más' }).tap();
  await quiz.getByRole('button', { name: 'Listo' }).tap();
  await expect(quiz.getByText(/^Mes 2 de 2/)).toBeVisible();
  for (let i = 0; i < 3; i++) await quiz.getByRole('button', { name: 'Regar menos' }).tap();
  await quiz.getByRole('button', { name: 'Listo' }).tap();
  await expect(quiz.getByRole('heading', { name: 'Balance de agua' })).toBeVisible();
  await nextChallenge(quiz);

  // 4 · ¿Seco para quién?: compara con lo normal de cada lugar (dos tarjetas son trampa).
  await expect(page.getByRole('dialog', { name: '¿Seco para quién?' })).toBeVisible();
  const answers = ['Más seco de lo normal', 'Normal para ese lugar', 'Más seco de lo normal', 'Más húmedo de lo normal'];
  for (const [i, a] of answers.entries()) {
    await quiz.getByRole('button', { name: a }).tap();
    await expect(quiz.getByText('¡Correcto!', { exact: false })).toBeVisible();
    await quiz.getByRole('button', { name: i < answers.length - 1 ? 'Siguiente lugar' : 'Terminar' }).tap();
  }
  await expect(quiz.getByRole('heading', { name: /^Anomalía/ })).toBeVisible();
  await nextChallenge(quiz);

  // 5 · La noche más fría: despejado + calma + hondonada = helada; después, cubrir con tela.
  await expect(page.getByRole('dialog', { name: 'La noche más fría' })).toBeVisible();
  await pick(quiz, 'Cielo', 'Despejado');
  await pick(quiz, 'Viento', 'En calma');
  await pick(quiz, 'Lugar', 'Hondonada');
  await quiz.getByRole('button', { name: 'Cubrirlo con tela antes de que oscurezca' }).tap();
  await expect(quiz.getByRole('heading', { name: 'Riesgo de helada' })).toBeVisible();
  await nextChallenge(quiz);

  // 6 · Detective del suelo (3 pasos): satélite, 3 sensores separados (se juntan solos) y regar el lote más seco.
  await expect(page.getByRole('dialog', { name: 'Detective del suelo' })).toBeVisible();
  await expect(quiz.getByRole('list', { name: 'Pasos del reto' })).toBeVisible();
  await quiz.getByRole('button', { name: 'Mirar con el satélite' }).tap();
  await quiz.getByRole('button', { name: 'Ahora mide en el campo' }).tap();
  for (const col of [1, 2, 3]) await quiz.getByRole('button', { name: new RegExp(`^Lote fila 1, columna ${col}$`) }).tap();
  await expect(quiz.getByText('Satélite + sensores')).toBeVisible();
  await quiz.getByRole('button', { name: /^Lote fila 2, columna 4: cerca de/ }).tap();
  await expect(quiz.getByRole('heading', { name: 'Satélite vs. medición en campo' })).toBeVisible();
  await nextChallenge(quiz);

  // 7 · Sobrevive la temporada: avisos del satélite en frases y la mejor decisión en cada momento.
  await expect(page.getByRole('dialog', { name: 'Sobrevive la temporada' })).toBeVisible();
  await expect(quiz.getByText(/Cayeron \d+ mm de lluvia en un solo día/)).toBeVisible();
  const best = ['Dejar rastrojo o sembrar una cobertura', 'Regar al amanecer y cubrir el suelo', 'Ir a mirar esa esquina', 'Sembrar frijol (rotar)'];
  for (const [i, option] of best.entries()) {
    await quiz.getByRole('button', { name: option }).tap();
    await quiz.getByRole('button', { name: i < best.length - 1 ? 'Siguiente momento' : 'Ver cómo terminó' }).tap();
  }
  await expect(page.getByRole('dialog', { name: 'Así terminó tu temporada' })).toBeVisible();
  await expect(quiz.getByText('Vulnerabilidad baja')).toBeVisible();
  await expect(quiz.getByText('Suelo sano')).toBeVisible();
  await quiz.getByRole('button', { name: 'Terminar', exact: true }).tap();
  await expect(quiz.getByRole('heading', { name: 'Vulnerabilidad del cultivo' })).toBeVisible();
  await quiz.getByRole('button', { name: 'Terminar los retos' }).tap();
}

test('los 7 retos del glosario se juegan con roles accesibles y arman el perfil de campo', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const welcome = await firstVisit(page);
  await welcome.getByRole('button', { name: '¡A jugar!', exact: true }).tap();
  await profileQuestions(page, 'Agricultor o agricultora', 'Con dibujos');
  await playAllPerfectly(page);

  const quiz = quizOf(page);
  await expect(quiz.getByRole('img', { name: '21 estrellas ganadas' })).toBeVisible();
  await quiz.getByText('Ver el clima de mi zona', { exact: true }).tap();
  await quiz.getByRole('button', { name: 'Siguiente', exact: true }).tap();
  // Perfil: insignia por rol + misión, nivel por estrellas y lo que ya domina.
  await expect(page.getByRole('dialog', { name: 'Vigía del clima' })).toBeVisible();
  await expect(quiz.getByText('Nivel 3: Cosecha')).toBeVisible();
  await expect(quiz.getByText('Ya dominas')).toBeVisible();
  await expect(quiz.getByText('Para repasar')).toBeHidden();
  await quiz.getByRole('button', { name: 'Ver cómo queda mi app' }).tap();
  const suggestion = page.getByRole('dialog', { name: 'Así te mostramos la app' });
  await expect(suggestion.getByText('Modo sencillo')).toBeVisible();
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fieldshift:profile:v1') ?? '{}'));
  expect(saved.quest).toMatchObject({ level: 'advanced', stars: 21, maxStars: 21, review: [] });
  expect(saved.quest.mastered).toContain('ndvi');
  expect(errors).toEqual([]);
});

test('agricultor que prefiere escuchar: modo sencillo con voz y el panel de su zona', async ({ page }) => {
  const welcome = await firstVisit(page);
  // El botón del locutor está en la bienvenida (antes de leer nada).
  await expect(welcome.getByRole('button', { name: 'Escuchar con voz' })).toBeVisible();
  await welcome.getByRole('button', { name: '¡A jugar!', exact: true }).tap();

  const quiz = await profileQuestions(page, 'Agricultor o agricultora', 'Escuchando');
  // Saltar un reto lo marca para repasar; "Saltar retos" lleva a la misión.
  await quiz.getByRole('button', { name: 'Saltar este reto' }).tap();
  await expect(page.getByRole('dialog', { name: 'El campo suda' })).toBeVisible();
  await quiz.getByRole('button', { name: 'Saltar retos' }).tap();
  const suggestion = await missionAndProfile(page, 'Ver el clima de mi zona');
  await expect(suggestion.getByText('Sugerencia automática')).toBeVisible();
  await expect(suggestion.getByText('Modo sencillo')).toBeVisible();
  await expect(suggestion.getByRole('switch', { name: /Voz que lee en voz alta/ })).toHaveAttribute('aria-checked', 'true');
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'lite');
  expect(await page.evaluate(() => localStorage.getItem('fieldshift:narrator'))).toBe('1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fieldshift:profile:v1') ?? '{}'));
  expect(saved.role).toBe('farmer');
  expect(saved.quest).toMatchObject({ level: 'beginner', stars: 0 });
  expect(saved.quest.review).toContain('ndvi');

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
  await welcome.getByRole('button', { name: '¡A jugar!', exact: true }).tap();
  const quiz = await profileQuestions(page, 'Técnico o técnica', 'Con dibujos');
  // El técnico ve "la ciencia" en los retos: la fórmula del NDVI al encender la visión del satélite.
  await quiz.getByRole('button', { name: 'Visión satélite' }).tap();
  await expect(quiz.getByText(/NDVI = \(infrarrojo − rojo\)/)).toBeVisible();
  await quiz.getByRole('button', { name: 'Saltar retos' }).tap();
  const suggestion = await missionAndProfile(page, 'Ver datos de satélite');
  await expect(suggestion.getByText('Modo completo')).toBeVisible();
  // La persona puede cambiar la sugerencia antes de aceptarla.
  await suggestion.getByRole('button', { name: 'Prefiero el modo sencillo' }).tap();
  await expect(suggestion.getByText('Modo sencillo')).toBeVisible();
  await suggestion.getByRole('button', { name: 'Prefiero el modo completo' }).tap();
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  await expect(page.getByRole('dialog', { name: 'Capas de datos NASA' })).toBeVisible();
});

test('la voz encendida en la bienvenida sigue encendida aunque elija "Con dibujos"', async ({ page }) => {
  const welcome = await firstVisit(page);
  await welcome.getByRole('button', { name: 'Escuchar con voz' }).tap();
  await welcome.getByRole('button', { name: '¡A jugar!', exact: true }).tap();
  const quiz = await profileQuestions(page, 'Agricultor o agricultora', 'Con dibujos');
  await quiz.getByRole('button', { name: 'Saltar retos' }).tap();
  const suggestion = await missionAndProfile(page, 'Ver el clima de mi zona');
  await expect(suggestion.getByRole('switch', { name: /Voz que lee en voz alta/ })).toHaveAttribute('aria-checked', 'true');
  await suggestion.getByRole('button', { name: 'Usar así' }).tap();
  expect(await page.evaluate(() => localStorage.getItem('fieldshift:narrator'))).toBe('1');
});

test('saltar la bienvenida deja la app como siempre', async ({ page }) => {
  const welcome = await firstVisit(page);
  await welcome.getByRole('button', { name: 'Saltar' }).tap();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole('dialog', { name: '¿Quién eres?' })).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lite');
  expect(await page.evaluate(() => localStorage.getItem('fieldshift:onboarded:v2'))).toBe('1');
});

test('el agente recibe el perfil (con el nivel de los retos) para adaptar sus respuestas', async ({ page }) => {
  await page.goto('/es');
  await page.evaluate(() => {
    localStorage.setItem('fieldshift:mode', 'lite');
    localStorage.setItem(
      'fieldshift:profile:v1',
      JSON.stringify({
        role: 'farmer',
        goal: 'climate',
        reading: 'little',
        suggestions: ['¿Cómo está la lluvia en mi zona?'],
        source: 'rules',
        quest: { level: 'beginner', stars: 6, maxStars: 21, mastered: ['ndvi'], review: ['anomaly', 'frost'] },
      }),
    );
  });
  await page.reload();
  await waitForGlobe(page);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'lite');
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/agent') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Abrir el asistente del campo' }).tap();
  // Las preguntas para empezar son las que sugirió el perfil.
  await page.getByRole('button', { name: '¿Cómo está la lluvia en mi zona?' }).tap();
  const body = (await sent).postDataJSON() as { profile?: Record<string, unknown> };
  expect(body.profile).toEqual({ role: 'farmer', mode: 'lite', narrator: false, level: 'beginner', review: ['anomaly', 'frost'] });
});
