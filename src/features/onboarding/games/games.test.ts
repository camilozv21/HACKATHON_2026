import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import es from '../../../../messages/es.json';
import { GLOSSARY_TERMS } from '@/features/glossary/terms';
import { QuestSummary } from '@/lib/api/contract';
import { GAME_IDS, GAMES, levelFor, MAX_STARS, starsFor, summarize, type QuestResults } from './catalog';
import {
  ANOMALY_CARDS,
  applyChoice,
  BALANCE_ROUNDS,
  balanceVerdict,
  classifyAnomaly,
  combinedEstimate,
  dawnTemp,
  ET_MAX,
  ET_START,
  etPerDay,
  frostRisk,
  IRRIGATION_MAX,
  IRRIGATION_STEP,
  isDriest,
  NDVI_LOTS,
  precision,
  SATELLITE_MEAN,
  SATELLITE_PRECISION,
  SEASON_START,
  SEASON_TURNS,
  SENSOR_CELLS,
  soilStatus,
  STRESSED_LOTS,
  tankLevel,
  TANK_BAND,
  truthAt,
  vulnerability,
  waterBalance,
} from './logic';

describe('reto NDVI', () => {
  it('hay 3 lotes con estrés y el resto se ve vigoroso', () => {
    expect(STRESSED_LOTS).toHaveLength(3);
    for (const [i, v] of NDVI_LOTS.entries()) if (!STRESSED_LOTS.includes(i)) expect(v).toBeGreaterThan(0.65);
  });
});

describe('reto evapotranspiración', () => {
  it('sol, viento y suelo desnudo suben la evapotranspiración; cubrir el suelo la baja', () => {
    const base = etPerDay(ET_START);
    expect(etPerDay({ ...ET_START, sun: true })).toBeGreaterThan(base);
    expect(etPerDay({ ...ET_START, wind: true })).toBeGreaterThan(base);
    expect(etPerDay({ ...ET_START, bare: true })).toBeGreaterThan(base);
    expect(etPerDay({ sun: true, wind: true, bare: false })).toBeLessThan(ET_MAX);
    // Solo la combinación de los tres da el máximo (la misión del reto).
    const all = [true, false].flatMap((sun) => [true, false].flatMap((wind) => [true, false].map((bare) => ({ sun, wind, bare }))));
    expect(all.filter((w) => etPerDay(w) === ET_MAX)).toEqual([{ sun: true, wind: true, bare: true }]);
  });
});

describe('reto balance de agua', () => {
  const solutions = (r: (typeof BALANCE_ROUNDS)[number]) =>
    Array.from({ length: IRRIGATION_MAX / IRRIGATION_STEP + 1 }, (_, k) => k * IRRIGATION_STEP).flatMap((irrigation) =>
      (r.cover ? [false, true] : [false]).filter((c) => balanceVerdict(waterBalance(r, irrigation, c)) === 'ok').map((c) => ({ irrigation, c })),
    );

  it('cada mes tiene solución y empieza fuera de la franja buena', () => {
    for (const r of BALANCE_ROUNDS) {
      expect(solutions(r).length).toBeGreaterThan(0);
      expect(balanceVerdict(waterBalance(r, r.irrigation, false))).not.toBe('ok');
    }
  });

  it('en el mes seco cubrir el suelo permite regar menos; en el de lluvias la respuesta es no regar', () => {
    const dry = solutions(BALANCE_ROUNDS[0]!);
    const minWith = Math.min(...dry.filter((s) => s.c).map((s) => s.irrigation));
    const minWithout = Math.min(...dry.filter((s) => !s.c).map((s) => s.irrigation));
    expect(minWith).toBeLessThan(minWithout);
    expect(solutions(BALANCE_ROUNDS[1]!)).toEqual([{ irrigation: 0, c: false }]);
  });

  it('la franja verde del tanque coincide con el balance bueno', () => {
    expect(TANK_BAND).toEqual({ min: 45, max: 65 });
    expect(tankLevel(0)).toBe(50);
  });
});

describe('reto anomalía', () => {
  it('compara con lo normal del lugar: el desierto es normal y la selva está más seca', () => {
    const by = Object.fromEntries(ANOMALY_CARDS.map((c) => [c.id, classifyAnomaly(c.now, c.normal)]));
    expect(by).toEqual({ boyaca: 'drier', guajira: 'normal', choco: 'drier', llanos: 'wetter' });
    // La trampa: el Chocó tiene más agua que Boyacá y aun así está más seco de lo normal.
    const choco = ANOMALY_CARDS.find((c) => c.id === 'choco')!;
    const guajira = ANOMALY_CARDS.find((c) => c.id === 'guajira')!;
    expect(choco.now).toBeGreaterThan(guajira.now);
  });
});

describe('reto helada', () => {
  it('solo la noche despejada, en calma y en la hondonada baja de cero', () => {
    const all = [true, false].flatMap((clear) => [true, false].flatMap((calm) => [true, false].map((hollow) => ({ clear, calm, hollow }))));
    expect(all.filter((n) => frostRisk(dawnTemp(n)) === 'frost')).toEqual([{ clear: true, calm: true, hollow: true }]);
    expect(frostRisk(dawnTemp({ clear: false, calm: false, hollow: false }))).toBe('low');
    expect(frostRisk(dawnTemp({ clear: true, calm: true, hollow: false }))).toBe('high');
  });
});

describe('reto satélite + sensores', () => {
  it('el satélite ve el promedio; juntar sensores sube la precisión', () => {
    expect(SATELLITE_MEAN).toBe(23);
    expect(precision([0, 1, 2])).toBeGreaterThan(precision([0, 4, 8]));
    expect(precision([0, 4, 8])).toBeGreaterThan(SATELLITE_PRECISION);
  });

  it('con cualquier lugar de los sensores, el lote más seco sigue viéndose como el más seco', () => {
    const cells = Array.from({ length: SENSOR_CELLS }, (_, i) => i);
    for (const a of cells)
      for (const b of cells)
        for (const c of cells) {
          if (a >= b || b >= c) continue;
          const probes = [a, b, c];
          const est = cells.map((i) => combinedEstimate(i, probes));
          const min = Math.min(...est);
          expect(cells.filter((i) => est[i] === min).every(isDriest)).toBe(true);
          for (const p of probes) expect(est[p]).toBe(truthAt(p));
        }
  });
});

describe('reto temporada', () => {
  it('cada turno tiene una sola mejor opción y la buena temporada deja cultivo y suelo sanos', () => {
    let best = SEASON_START;
    let worst = SEASON_START;
    for (const turn of SEASON_TURNS) {
      expect(turn.options.filter((o) => o.best)).toHaveLength(1);
      // La mejor no siempre va primero.
      best = applyChoice(best, turn.options.find((o) => o.best)!);
      worst = applyChoice(worst, turn.options.reduce((a, o) => (o.crop + o.soil < a.crop + a.soil ? o : a)));
    }
    expect(SEASON_TURNS.map((t) => t.options.findIndex((o) => o.best))).not.toEqual([0, 0, 0, 0]);
    expect([vulnerability(best.crop), soilStatus(best.soil)]).toEqual(['low', 'good']);
    // Entre los 4 momentos aparecen las 5 variables del reto (calor, humedad, lluvia, evaporación y verdor),
    // cada una con su aviso en frase en los dos idiomas.
    expect(new Set(SEASON_TURNS.flatMap((t) => t.focus))).toEqual(new Set(['temp', 'moisture', 'rain', 'et', 'ndvi']));
    for (const msgs of [es, en]) {
      const turns = msgs.onboarding.games.season.turns as unknown as Record<string, { say: Record<string, string> }>;
      for (const turn of SEASON_TURNS) for (const k of turn.focus) expect(turns[turn.id]?.say[k]).toContain('{value}');
    }
    expect([vulnerability(worst.crop), soilStatus(worst.soil)]).toEqual(['high', 'poor']);
  });
});

describe('catálogo y perfil de los retos', () => {
  it('cada reto enseña términos que existen en el glosario y tiene sus textos', () => {
    const games = es.onboarding.games as unknown as Record<string, Record<string, unknown>>;
    for (const id of GAME_IDS) {
      for (const term of GAMES[id].terms) expect(GLOSSARY_TERMS).toContain(term);
      for (const key of ['name', 'title', 'lesson', 'science']) expect(typeof games[id]?.[key]).toBe('string');
    }
  });

  it('estrellas por errores y nivel por el total', () => {
    expect([0, 1, 2, 3, 9].map(starsFor)).toEqual([3, 2, 2, 1, 1]);
    expect(MAX_STARS).toBe(21);
    expect([levelFor(21), levelFor(17), levelFor(16), levelFor(10), levelFor(9)]).toEqual([
      'advanced',
      'advanced',
      'intermediate',
      'intermediate',
      'beginner',
    ]);
  });

  it('el resumen marca lo que domina y lo que conviene repasar (saltar = repasar), y cumple el contrato', () => {
    const r: QuestResults = { ndvi: 3, et: 3, balance: 2, anomaly: 1, frost: 0 };
    const s = summarize(r);
    expect(s).toEqual({ level: 'beginner', stars: 9, maxStars: 21, mastered: ['ndvi', 'et'], review: ['anomaly', 'frost', 'satellite-vs-field', 'crop-vulnerability'] });
    expect(QuestSummary.safeParse(s).success).toBe(true);
    const perfect = summarize(Object.fromEntries(GAME_IDS.map((id) => [id, 3])) as QuestResults);
    expect(perfect.level).toBe('advanced');
    expect(perfect.review).toEqual([]);
  });
});
