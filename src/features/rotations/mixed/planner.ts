import type { Confidence, CropId, DataSource, FarmerPriorities, FieldSurvey, Level, SoilInfo } from '@/lib/api/contract';
import { bestWindow, cropWindow, monthScore, shiftMonth, type MonthlyClimate, type WaterContext, type Window } from './climate';
import { GUILDS, matchGuild, type Guild } from './guilds';
import { pairsOf, type PairRelation, type Reason } from './relations';
import {
  canSupport,
  coversGround,
  cycleClassOf,
  PLANNER_CROPS,
  rootLayerOf,
  stratumOf,
  traitsOf,
  type CropTraits,
  type RootLayer,
  type Stratum,
} from './traits';

/**
 * Planificador de cultivos asociados (todo en el cliente, con reglas visibles, como el orden de prioridades).
 *
 *   clima         = 0,6 × el cultivo que peor se da + 0,4 × el promedio      (NASA POWER, mejor mes de siembra)
 *   se ayudan     = 50 + 25 × promedio de las parejas (−2 a +2)            (asociaciones conocidas + rasgos)
 *   alturas y raíces = 45 % espacio con hojas del suelo a la planta más alta
 *                    + 35 % suelo explorado por raíces + 20 % ciclos escalonados
 *   suelo         = 35 + 25 si fija nitrógeno + 20 si cubre el suelo (más si hay riesgo de erosión)
 *                   + 10 raíces profundas + 5 perenne − 15 si dos piden mucho abono sin leguminosa
 *   tu finca      = 60 ± lo que nos contaste (familia de la última siembra, abono, plagas, mercado…)
 *
 *   total = promedio ponderado: clima ×3 (+1 si ahorrar agua importa mucho), se ayudan ×2, alturas ×2,
 *           suelo ×(1 + (suelo + erosión) ÷ 5), tu finca ×2 si respondiste la encuesta (si no, ×1)
 */

export type MixContext = {
  /** Clima mensual (null: sin clima todavía; el puntaje de clima queda neutro). */
  climate: MonthlyClimate | null;
  water: WaterContext;
  soil?: SoilInfo;
  erosion?: Level;
  waterlogging?: Level;
  survey: FieldSurvey | null;
  priorities: FarmerPriorities;
  /** Cultivos de la rotación actual (de la finca o la típica de la zona). */
  known?: readonly CropId[];
};

export type Member = { crop: CropId; sowWeek?: number };

export type MemberPlan = {
  crop: CropId;
  traits: CropTraits;
  perennial: boolean;
  sowWeek: number;
  /** Ventana de siembra (null sin clima). */
  window: Window | null;
};

export type Band = { crop: CropId; from: number; to: number };

export type SpaceUse = {
  /** Altura de referencia (m): la planta más alta, mínimo 2,5 m. */
  heightRef: number;
  /** Parte del espacio entre el suelo y heightRef con hojas (0–1). */
  aboveUse: number;
  /** Profundidad de referencia (m), mínimo 1,5 m. */
  rootRef: number;
  /** Parte del suelo explorado por raíces (0–1). */
  rootUse: number;
  timeUse: number;
  foliage: Band[];
  roots: Band[];
  /** Planta que sirve de tutor a los trepadores (si hay). */
  support: CropId | null;
  groundCovered: boolean;
  strata: Stratum[];
  rootLayers: RootLayer[];
  maxHeight: number;
  maxRoot: number;
};

export const DIM_KEYS = ['climate', 'synergy', 'space', 'soil', 'fit'] as const;
export type DimKey = (typeof DIM_KEYS)[number];

export type NoteId =
  | 'fixer'
  | 'cover'
  | 'coverErosion'
  | 'layers'
  | 'roots'
  | 'familiar'
  | 'common'
  | 'rotationBreak'
  | 'noFertilizer'
  | 'weeds'
  | 'armyworm'
  | 'home'
  | 'market'
  | 'repeat'
  | 'heavyNoN'
  | 'needsSupport'
  | 'wet'
  | 'dry'
  | 'cold'
  | 'moreWork';

export type Note = { id: NoteId; tone: 'good' | 'warn'; crops: CropId[]; source: DataSource; pct?: number; meters?: number };

/** Orden en que se muestran las notas: primero lo que más pesa para el suelo y para esta finca. */
const NOTE_ORDER: NoteId[] = [
  'repeat',
  'cold',
  'dry',
  'wet',
  'needsSupport',
  'heavyNoN',
  'rotationBreak',
  'noFertilizer',
  'coverErosion',
  'fixer',
  'cover',
  'layers',
  'familiar',
  'common',
  'market',
  'weeds',
  'armyworm',
  'home',
  'roots',
  'moreWork',
];

export type Niche = 'cover' | 'fixer' | 'support' | 'deep';

export type MixEval = {
  crops: CropId[];
  members: MemberPlan[];
  pairs: PairRelation[];
  space: SpaceUse;
  dims: Record<DimKey, number>;
  weights: Record<DimKey, number>;
  total: number;
  /** El clima no lo descarta (clima ≥ 45, o todavía sin clima). */
  viable: boolean;
  climateKnown: boolean;
  missing: Niche[];
  notes: Note[];
};

// ---------------------------------------------------------------- utilidades

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const weeksToMonths = (w: number) => Math.round(w / 4.345);

function unionLength(bands: [number, number][]): number {
  const sorted = bands.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/** Cuántas respuestas tiene la encuesta (0–6). */
export function surveyAnswered(s: FieldSurvey | null | undefined): number {
  if (!s) return 0;
  return (
    (s.usualCrops.length ? 1 : 0) +
    (s.lastCrop ? 1 : 0) +
    (s.fertilization ? 1 : 0) +
    (s.residues ? 1 : 0) +
    (s.pests ? 1 : 0) +
    (s.purpose ? 1 : 0)
  );
}

// ---------------------------------------------------------------- alturas, volumen y raíces

function foliageBand(t: CropTraits, support: CropTraits | null): [number, number] {
  switch (t.habit) {
    case 'creeper':
      return [0, t.heightM];
    case 'grass':
      return [t.heightM * 0.1, t.heightM];
    case 'bush':
      return [t.heightM * 0.15, t.heightM];
    case 'erect':
      return [t.heightM * 0.3, t.heightM];
    case 'tree':
      return [t.heightM * 0.4, t.heightM];
    case 'climber':
      // Con tutor sube por él; sin tutor se arrastra por el suelo.
      return support ? [0.3, Math.min(t.heightM, support.heightM)] : [0, Math.min(0.6, t.heightM)];
  }
}

export function spaceUse(crops: readonly CropId[]): SpaceUse {
  const ts = crops.map((c) => [c, traitsOf(c)!] as const);
  const hasClimber = ts.some(([, t]) => t.habit === 'climber');
  const supportEntry = hasClimber
    ? ts.filter(([, t]) => canSupport(t)).sort((a, b) => b[1].heightM - a[1].heightM)[0]
    : undefined;
  const support = supportEntry?.[1] ?? null;

  const foliage: Band[] = ts.map(([c, t]) => {
    const [from, to] = foliageBand(t, t.habit === 'climber' ? support : null);
    return { crop: c, from, to };
  });
  const roots: Band[] = ts.map(([c, t]) => ({ crop: c, from: t.rootM * 0.25, to: t.rootM }));
  const maxHeight = Math.max(0, ...foliage.map((b) => b.to));
  const maxRoot = Math.max(0, ...ts.map(([, t]) => t.rootM));
  const heightRef = Math.max(2.5, maxHeight);
  const rootRef = Math.max(1.5, maxRoot);

  const aboveUse = Math.min(1, unionLength(foliage.map((b) => [b.from, Math.min(b.to, heightRef)])) / heightRef);
  const rootUse = Math.min(1, unionLength(roots.map((b) => [b.from, b.to])) / rootRef);
  const timeUse = new Set(ts.map(([, t]) => cycleClassOf(t))).size / 3;
  const groundCovered = ts.some(([, t]) => coversGround(t)) || foliage.some((b) => b.from <= 0.05 && traitsOf(b.crop)!.spreadM >= 0.8);

  return {
    heightRef,
    aboveUse,
    rootRef,
    rootUse,
    timeUse,
    foliage,
    roots,
    support: supportEntry?.[0] ?? null,
    groundCovered,
    strata: [...new Set(ts.map(([, t]) => stratumOf(t.heightM)))],
    rootLayers: [...new Set(ts.map(([, t]) => rootLayerOf(t.rootM)))],
    maxHeight,
    maxRoot,
  };
}

// ---------------------------------------------------------------- clima de la mezcla

/** Meses de inicio permitidos: mezclas de la época fresca solo en la mitad más fresca del año. */
function startMonths(c: MonthlyClimate, coolSeason: boolean): number[] {
  const all = Array.from({ length: 12 }, (_, i) => i + 1);
  if (!coolSeason) return all;
  const temps = c.tMean.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (temps.length < 12) return all;
  const median = (temps[5]! + temps[6]!) / 2;
  return all.filter((m) => (c.tMean[m - 1] ?? median) <= median);
}

function planWindows(members: MemberPlan[], c: MonthlyClimate, w: WaterContext, coolSeason: boolean): MemberPlan[] {
  let best: { s: number; agg: number; wins: Window[] } | null = null;
  for (const s of startMonths(c, coolSeason)) {
    const wins = members.map((m) =>
      m.perennial ? bestWindow(m.traits, c, w) : cropWindow(m.traits, shiftMonth(s, weeksToMonths(m.sowWeek)), c, w),
    );
    const scores = wins.map((x) => x.score);
    const agg = 0.6 * Math.min(...scores) + 0.4 * (scores.reduce((a, b) => a + b, 0) / scores.length);
    if (!best || agg > best.agg + 1e-9) best = { s, agg, wins };
  }
  return members.map((m, i) => ({ ...m, window: best!.wins[i]! }));
}

// ---------------------------------------------------------------- evaluación

export function evaluateMix(input: readonly Member[], ctx: MixContext, opts: { coolSeason?: boolean } = {}): MixEval {
  const seen = new Set<CropId>();
  const base = input.filter((m) => traitsOf(m.crop) && !seen.has(m.crop) && seen.add(m.crop));
  let members: MemberPlan[] = base.map((m) => {
    const t = traitsOf(m.crop)!;
    return { crop: m.crop, traits: t, perennial: Boolean(t.perennial), sowWeek: m.sowWeek ?? 0, window: null };
  });
  const crops = members.map((m) => m.crop);
  const climateKnown = Boolean(ctx.climate);
  if (ctx.climate && members.length) members = planWindows(members, ctx.climate, ctx.water, Boolean(opts.coolSeason));

  const pairs = pairsOf(crops);
  const space = spaceUse(crops);
  const p = ctx.priorities;
  const s = ctx.survey;
  const ts = members.map((m) => m.traits);
  const fixers = members.filter((m) => m.traits.nFix).map((m) => m.crop);
  const heavy = members.filter((m) => m.traits.feeder === 'heavy' && !m.traits.nFix).map((m) => m.crop);
  const covers = members.filter((m) => coversGround(m.traits)).map((m) => m.crop);
  const notes: Note[] = [];

  // Clima
  let climate = 60;
  if (climateKnown && members.length) {
    const sc = members.map((m) => m.window!.score);
    climate = Math.round(100 * (0.6 * Math.min(...sc) + 0.4 * (sc.reduce((a, b) => a + b, 0) / sc.length)));
    for (const m of members) {
      if (m.window!.temp < 0.6) notes.push({ id: 'cold', tone: 'warn', crops: [m.crop], source: 'NASA POWER' });
      else if (m.window!.rain != null && m.window!.rain < 0.5)
        notes.push({ id: 'dry', tone: 'warn', crops: [m.crop], source: 'NASA POWER' });
    }
  }

  // Se ayudan
  const synergy =
    pairs.length === 0 ? 50 : Math.round(clamp(50 + 25 * (pairs.reduce((a, x) => a + x.value, 0) / pairs.length)));

  // Alturas, volumen y raíces
  const spaceScore = Math.round(100 * (0.45 * space.aboveUse + 0.35 * space.rootUse + 0.2 * space.timeUse));
  if (members.length >= 2 && space.aboveUse >= 0.75)
    notes.push({ id: 'layers', tone: 'good', crops, source: 'Modelo agronómico', pct: Math.round(space.aboveUse * 100), meters: space.heightRef });
  if (members.length >= 2 && space.rootLayers.length >= 2)
    notes.push({ id: 'roots', tone: 'good', crops, source: 'Modelo agronómico', meters: space.maxRoot });
  const climbers = members.filter((m) => m.traits.habit === 'climber').map((m) => m.crop);
  if (climbers.length && !space.support) notes.push({ id: 'needsSupport', tone: 'warn', crops: climbers, source: 'Modelo agronómico' });

  // Suelo
  const erosionFactor = ctx.erosion === 'high' ? 1.25 : ctx.erosion === 'low' ? 0.8 : 1;
  const soil = Math.round(
    clamp(
      35 +
        (fixers.length ? 25 : 0) +
        (space.groundCovered ? 20 * erosionFactor : 0) +
        (space.maxRoot >= 1.2 ? 10 : 0) +
        (members.some((m) => m.perennial) ? 5 : 0) -
        (heavy.length >= 2 && !fixers.length ? 15 : 0),
    ),
  );
  if (fixers.length) notes.push({ id: 'fixer', tone: 'good', crops: fixers, source: 'Modelo agronómico' });
  if (space.groundCovered) {
    const by = covers.length ? covers : crops.filter((c) => space.foliage.find((b) => b.crop === c)!.from <= 0.05);
    notes.push(
      ctx.erosion === 'high'
        ? { id: 'coverErosion', tone: 'good', crops: by, source: 'SRTM' }
        : { id: 'cover', tone: 'good', crops: by, source: 'Modelo agronómico' },
    );
  }

  // Encaja con tu finca
  let fit = 60;
  if (!s?.usualCrops.length && ctx.known?.length) {
    // Sin encuesta: lo que ya se siembra en la finca o la zona cuenta un poco (se sabe manejar y tiene mercado).
    const common = crops.filter((c) => ctx.known!.includes(c));
    if (common.length) {
      fit += Math.min(12, 4 * common.length);
      notes.push({ id: 'common', tone: 'good', crops: common, source: 'Dato local' });
    }
  }
  if (s) {
    const familiar = crops.filter((c) => s.usualCrops.includes(c));
    if (familiar.length) {
      fit += Math.min(18, 6 * familiar.length);
      notes.push({ id: 'familiar', tone: 'good', crops: familiar, source: 'Dato local' });
    }
    const last = s.lastCrop && s.lastCrop !== 'fallow' ? traitsOf(s.lastCrop) : null;
    if (last && s.lastCrop) {
      const repeats = members.filter((m) => !m.perennial && m.traits.family === last.family && last.family !== 'mixed');
      if (repeats.length) {
        fit -= 25;
        notes.push({ id: 'repeat', tone: 'warn', crops: [s.lastCrop], source: 'Dato local' });
      } else if (!members.every((m) => m.perennial)) {
        fit += last.family === 'grass' && fixers.length ? 12 : 6;
        notes.push({ id: 'rotationBreak', tone: 'good', crops: [s.lastCrop], source: 'Dato local' });
      }
    }
    if (s.fertilization === 'none') {
      if (fixers.length) {
        fit += 10;
        notes.push({ id: 'noFertilizer', tone: 'good', crops: fixers, source: 'Dato local' });
      } else if (heavy.length) {
        fit -= 10;
        notes.push({ id: 'heavyNoN', tone: 'warn', crops: heavy, source: 'Dato local' });
      }
    }
    if (s.pests?.includes('weeds') && space.groundCovered) {
      fit += 6;
      notes.push({ id: 'weeds', tone: 'good', crops: covers, source: 'Dato local' });
    }
    if (s.pests?.includes('armyworm') && members.length >= 2) {
      const families = new Set(ts.map((t) => t.family));
      if (families.size >= 2) {
        fit += 6;
        notes.push({ id: 'armyworm', tone: 'good', crops, source: 'Dato local' });
      }
    }
    const foods = members.filter((m) => m.traits.food).map((m) => m.crop);
    if ((s.purpose === 'home' || s.purpose === 'both') && foods.length >= 2) {
      fit += 6;
      notes.push({ id: 'home', tone: 'good', crops: foods, source: 'Dato local' });
    }
  }
  if (!fixers.length && heavy.length >= 2 && s?.fertilization !== 'none')
    notes.push({ id: 'heavyNoN', tone: 'warn', crops: heavy, source: 'Modelo agronómico' });

  const wetSoil = ctx.soil?.drainage === 'poor' || ctx.waterlogging === 'high';
  if (wetSoil) {
    const sensitive = members.filter((m) => m.traits.waterlog === 'low').map((m) => m.crop);
    if (sensitive.length) {
      fit -= Math.min(15, 5 * sensitive.length);
      notes.push({ id: 'wet', tone: 'warn', crops: sensitive, source: ctx.soil?.drainage === 'poor' ? 'Dato local' : 'GPM' });
    }
  }
  const markets = p.constraints.markets;
  const sells = crops.filter((c) => markets.includes(c));
  if (sells.length) {
    fit += Math.round(8 * (p.income / 5 + 0.4));
    notes.push({ id: 'market', tone: 'good', crops: sells, source: 'Dato local' });
  }
  if (p.forage >= 4 && members.some((m) => ['oats', 'vetch', 'alfalfa', 'clover', 'pasture', 'cowpea'].includes(m.crop))) fit += 6;
  if (members.length >= 3 || (p.laborEquipment >= 4 && members.length >= 2)) {
    if (p.laborEquipment >= 4) fit -= 8;
    notes.push({ id: 'moreWork', tone: 'warn', crops, source: 'Modelo agronómico' });
  }
  fit = Math.round(clamp(fit));

  const dims: Record<DimKey, number> = { climate, synergy, space: spaceScore, soil, fit };
  const weights: Record<DimKey, number> = {
    climate: 3 + (p.waterSaving >= 4 ? 1 : 0),
    synergy: 2,
    space: 2,
    soil: 1 + (p.soilHealth + p.erosionControl) / 5,
    fit: surveyAnswered(s) >= 2 ? 2 : 1,
  };
  const sumW = DIM_KEYS.reduce((a, k) => a + weights[k], 0);
  const total = Math.round(DIM_KEYS.reduce((a, k) => a + weights[k] * dims[k], 0) / sumW);

  const missing: Niche[] = [];
  if (!space.groundCovered) missing.push('cover');
  if (!fixers.length) missing.push('fixer');
  if (climbers.length && !space.support) missing.push('support');
  if (space.maxRoot < 1) missing.push('deep');

  return {
    crops,
    members,
    pairs,
    space,
    dims,
    weights,
    total,
    viable: !climateKnown || climate >= 45,
    climateKnown,
    missing,
    notes: notes.sort((a, b) => NOTE_ORDER.indexOf(a.id) - NOTE_ORDER.indexOf(b.id)),
  };
}

// ---------------------------------------------------------------- asociaciones conocidas

export type RankedGuild = { guild: Guild; eval: MixEval };

export function rankGuilds(ctx: MixContext): RankedGuild[] {
  return GUILDS.map((guild) => ({ guild, eval: evaluateMix(guild.members, ctx, { coolSeason: guild.coolSeason }) })).sort(
    (a, b) => Number(b.eval.viable) - Number(a.eval.viable) || b.eval.total - a.eval.total,
  );
}

// ---------------------------------------------------------------- qué agregar a una mezcla

export type AdditionWhy = { niche: Niche } | { reason: Reason } | { climate: true };

export type Addition = { crop: CropId; gain: number; eval: MixEval; why: AdditionWhy };

const FILLS: Record<Niche, (t: CropTraits) => boolean> = {
  cover: (t) => coversGround(t),
  fixer: (t) => Boolean(t.nFix),
  support: (t) => canSupport(t),
  deep: (t) => t.rootM >= 1.2,
};

/** Cultivos que más suben el puntaje si se agregan a la mezcla (máximo 4 cultivos). */
export function bestAdditions(base: readonly Member[], ctx: MixContext, limit = 3): Addition[] {
  if (base.length >= 4) return [];
  const baseEval = base.length ? evaluateMix(base, ctx) : null;
  const inBase = new Set(base.map((m) => m.crop));
  const hasPerennial = base.some((m) => traitsOf(m.crop)?.perennial);
  const support = baseEval?.space.support ?? base.map((m) => m.crop).find((c) => canSupport(traitsOf(c)!)) ?? null;

  const out: Addition[] = [];
  for (const crop of PLANNER_CROPS) {
    const t = traitsOf(crop)!;
    if (inBase.has(crop) || crop === 'pasture') continue;
    // Árboles y perennes solo junto a otros perennes (no se mezclan con una siembra de temporada).
    if ((t.perennial || t.habit === 'tree') && !hasPerennial) continue;
    if (ctx.climate && bestWindow(t, ctx.climate, ctx.water).score < 0.5) continue;
    const sowWeek = base.length && (t.habit === 'climber' || t.habit === 'creeper') && support ? 3 : 0;
    const e = evaluateMix([...base, { crop, sowWeek }], ctx);
    if (!e.viable) continue;
    const gain = e.total - (baseEval?.total ?? 0);
    const niche = baseEval?.missing.find((n) => FILLS[n](t));
    const pair = e.pairs
      .filter((x) => x.a === crop || x.b === crop)
      .sort((a, b) => b.value - a.value)[0];
    const why: AdditionWhy = niche
      ? { niche }
      : pair && pair.value > 0 && pair.reasons.find((r) => r.kind === 'helps')
        ? { reason: pair.reasons.find((r) => r.kind === 'helps')! }
        : { climate: true };
    out.push({ crop, gain, eval: e, why });
  }
  return out.sort((a, b) => b.gain - a.gain || b.eval.total - a.eval.total).slice(0, limit);
}

/** Mezcla armada a partir de un cultivo: le suma lo que más ayuda mientras suba el puntaje (máx. 3 cultivos). */
function growMix(start: CropId, ctx: MixContext): Member[] {
  const mix: Member[] = [{ crop: start }];
  while (mix.length < 3) {
    const add = bestAdditions(mix, ctx, 1)[0];
    if (!add || add.gain < 2) break;
    mix.push({ crop: add.crop, sowWeek: add.eval.members.find((m) => m.crop === add.crop)?.sowWeek ?? 0 });
  }
  return mix;
}

// ---------------------------------------------------------------- recomendación final

export type GapId = 'soilTest' | 'varieties' | 'survey' | 'climateMock' | 'prices';

export type Candidate = { members: Member[]; eval: MixEval; guild: Guild | null };

export type Recommendation = {
  /** Cultivo principal que recomendamos sembrar. */
  crop: CropId;
  /** Con qué sembrarlo (en el mismo terreno y temporada). */
  partners: CropId[];
  mix: Candidate;
  alternatives: Candidate[];
  basedOn: 'survey' | 'rotation' | 'zone';
  confidence: Confidence;
  gaps: GapId[];
};

/** Cultivo principal de una mezcla: el de la asociación conocida, o el que sostiene a los demás. */
export function mainCrop(c: Candidate): CropId {
  const g = c.guild?.members.find((m) => m.role === 'pillar' || m.role === 'main');
  if (g && c.eval.crops.includes(g.crop)) return g.crop;
  return c.members[0]!.crop;
}

function baseCrops(ctx: MixContext, current: readonly CropId[]): { crops: CropId[]; basedOn: Recommendation['basedOn'] } {
  const usable = (list: readonly CropId[]) => list.filter((c) => c !== 'fallow' && traitsOf(c));
  const fromSurvey = usable(ctx.survey?.usualCrops ?? []);
  if (fromSurvey.length) return { crops: fromSurvey.slice(0, 3), basedOn: 'survey' };
  const fromRotation = usable(current);
  if (fromRotation.length) return { crops: fromRotation.slice(0, 2), basedOn: 'rotation' };
  return { crops: [], basedOn: 'zone' };
}

/** Todas las mezclas candidatas: asociaciones conocidas + mezclas armadas desde lo que ya siembras. */
export function candidates(ctx: MixContext, current: readonly CropId[], ranked = rankGuilds(ctx)): Candidate[] {
  const out: Candidate[] = ranked
    .filter((r) => r.eval.viable && !r.guild.coolSeason)
    .map((r) => ({ members: r.guild.members, eval: r.eval, guild: r.guild }));
  const { crops } = baseCrops(ctx, current);
  const perennialFarm = crops.some((c) => traitsOf(c)?.perennial);
  for (const c of crops) {
    const t = traitsOf(c)!;
    if (perennialFarm && !t.perennial) continue;
    const members = growMix(c, ctx);
    const e = evaluateMix(members, ctx);
    if (!e.viable) continue;
    const key = [...e.crops].sort().join('|');
    if (out.some((o) => [...o.eval.crops].sort().join('|') === key)) continue;
    out.push({ members, eval: e, guild: matchGuild(e.crops) });
  }
  // En una finca de perennes (café, plátano…) no proponemos arrancar para sembrar de temporada; y en una de
  // temporada no proponemos como "próxima siembra" un sistema de varios años (sigue en la lista de asociaciones).
  const hasPerennial = (o: Candidate) => o.eval.members.some((m) => m.perennial);
  const pool = out.filter((o) => hasPerennial(o) === perennialFarm);
  return (pool.length ? pool : out).sort((a, b) => b.eval.total - a.eval.total);
}

export function recommend(
  ctx: MixContext,
  current: readonly CropId[],
  opts: { climateReal: boolean; ranked?: RankedGuild[] },
): Recommendation | null {
  const list = candidates(ctx, current, opts.ranked);
  const top = list[0];
  if (!top) return null;
  const crop = mainCrop(top);
  const { basedOn } = baseCrops(ctx, current);
  const answered = surveyAnswered(ctx.survey);
  const soilKnown = ctx.soil?.texture != null && ctx.soil.texture !== 'unknown';
  const points =
    (opts.climateReal ? 1 : 0) +
    (answered >= 3 ? 1 : 0) +
    (top.eval.pairs.some((p) => p.curated) || top.guild ? 1 : 0) +
    (top.eval.dims.climate >= 70 ? 1 : 0);
  const confidence: Confidence = points >= 4 && soilKnown ? 'high' : points >= 2 ? 'medium' : 'low';

  const gaps: GapId[] = [];
  if (ctx.soil?.ph == null && ctx.soil?.organicMatterPct == null) gaps.push('soilTest');
  if (answered < 3) gaps.push('survey');
  if (!opts.climateReal) gaps.push('climateMock');
  if (ctx.priorities.income >= 4) gaps.push('prices');
  gaps.push('varieties');

  const alternatives = list.slice(1).filter((c) => mainCrop(c) !== crop || c.guild?.id !== top.guild?.id).slice(0, 2);
  return {
    crop,
    partners: top.eval.crops.filter((c) => c !== crop),
    mix: top,
    alternatives,
    basedOn,
    confidence,
    gaps,
  };
}

// ---------------------------------------------------------------- plan de 2 años (asociar + rotar)

export type CoverPlan = { crop: CropId; sow: number; end: number };
export type PlanYear = { candidate: Candidate; cover: CoverPlan | null };
export type TwoYearPlan = { years: PlanYear[]; perennial: boolean };

const COVER_CROPS: CropId[] = ['vetch', 'clover', 'cowpea', 'mungbean', 'oats', 'rye', 'radish'];

/** Meses que la mezcla deja el suelo sin cultivo (racha más larga, cíclica). */
export function bareRun(e: MixEval): number[] {
  const covered = new Set<number>();
  for (const m of e.members) for (const x of m.window?.months ?? []) covered.add(x);
  if (covered.size === 0 || covered.size === 12) return [];
  let best: number[] = [];
  for (let start = 1; start <= 12; start++) {
    if (covered.has(start) || !covered.has(shiftMonth(start, -1))) continue;
    const run: number[] = [];
    for (let k = 0; k < 12 && !covered.has(shiftMonth(start, k)); k++) run.push(shiftMonth(start, k));
    if (run.length > best.length) best = run;
  }
  return best;
}

function coverFor(e: MixEval, ctx: MixContext, preferLegume: boolean): CoverPlan | null {
  const gap = bareRun(e);
  if (gap.length < 2 || !ctx.climate) return null;
  let best: { crop: CropId; score: number } | null = null;
  for (const crop of COVER_CROPS) {
    const t = traitsOf(crop)!;
    const L = Math.min(gap.length, Math.max(2, Math.round(t.cycleDays / 30)));
    const months = gap.slice(0, L);
    // Mismo cálculo por mes que el resto del plan (temperatura, heladas, meses muy lluviosos).
    const temp = months.reduce((a, m) => a + monthScore(t, m, ctx.climate!, ctx.water), 0) / L;
    const score = temp + (preferLegume && t.nFix ? 0.1 : 0);
    if (temp >= 0.6 && (!best || score > best.score)) best = { crop, score };
  }
  return best ? { crop: best.crop, sow: gap[0]!, end: gap[gap.length - 1]! } : null;
}

/**
 * Año 1: la mezcla recomendada. Año 2: la mejor mezcla de OTRA familia principal (rotar corta plagas y la
 * leguminosa deja nitrógeno), evaluada como si lo último sembrado fuera el principal del año 1.
 * Si el suelo queda desnudo dos meses o más, una cobertura que se dé en esos meses.
 */
export function twoYearPlan(rec: Recommendation, ctx: MixContext, current: readonly CropId[]): TwoYearPlan {
  const y1 = rec.mix;
  const perennial = y1.eval.members.some((m) => m.perennial);
  if (perennial) return { years: [{ candidate: y1, cover: null }], perennial: true };

  const pillar = mainCrop(y1);
  const pillarFamily = traitsOf(pillar)!.family;
  const ctx2: MixContext = {
    ...ctx,
    survey: {
      usualCrops: ctx.survey?.usualCrops ?? [],
      lastCrop: pillar,
      fertilization: ctx.survey?.fertilization ?? null,
      residues: ctx.survey?.residues ?? null,
      pests: ctx.survey?.pests ?? null,
      purpose: ctx.survey?.purpose ?? null,
    },
  };
  const y1Key = [...y1.eval.crops].sort().join('|');
  // Además de las mezclas de siempre, mezclas que arrancan con un cultivo de OTRA familia (para poder rotar).
  const rotators: Candidate[] = PLANNER_CROPS.filter((c) => {
    const t = traitsOf(c)!;
    return t.food && !t.perennial && t.family !== pillarFamily && (!ctx.climate || bestWindow(t, ctx.climate, ctx.water).score >= 0.6);
  })
    .sort((a, b) => Number(Boolean(traitsOf(b)!.nFix)) - Number(Boolean(traitsOf(a)!.nFix)))
    .slice(0, 5)
    .map((c) => {
      const members = growMix(c, ctx2);
      const e = evaluateMix(members, ctx2);
      return { members, eval: e, guild: matchGuild(e.crops) };
    })
    .filter((c) => c.eval.viable);
  const options = [...candidates(ctx2, current), ...rotators]
    .filter((c) => [...c.eval.crops].sort().join('|') !== y1Key && !c.eval.members.some((m) => m.perennial))
    .map((c) => {
      const fam = traitsOf(mainCrop(c))!.family;
      const shared = c.eval.crops.filter((x) => y1.eval.crops.includes(x)).length;
      return { c, score: c.eval.total + (fam !== pillarFamily ? 12 : -15) - 4 * shared };
    })
    .sort((a, b) => b.score - a.score);
  const y2 = options[0]?.c;
  const y2Heavy = y2 ? y2.eval.members.some((m) => m.traits.feeder === 'heavy') : false;
  const years: PlanYear[] = [{ candidate: y1, cover: coverFor(y1.eval, ctx, y2Heavy) }];
  if (y2) years.push({ candidate: y2, cover: coverFor(y2.eval, ctx, y1.eval.members.some((m) => m.traits.feeder === 'heavy')) });
  return { years, perennial: false };
}
