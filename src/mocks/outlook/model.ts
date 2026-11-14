/**
 * Proyección año por año de cada rotación (mock de POST /rotations/outlook). Reglas simples y visibles, con las
 * fuentes de cada número en references.ts y la explicación en docs/rotation-outlook.md:
 *
 *  - Materia orgánica: se acerca a un nuevo equilibrio con una respuesta lenta (décadas), no salta en un año.
 *  - Suelo que se lava: pérdida con suelo desnudo × factor de cobertura (lógica de RUSLE) → mm de capa perdida.
 *  - Ingreso neto: cambio de largo plazo (puntaje de ingresos) + efecto rotación que crece en 2–4 años − costos de
 *    aprender y establecer (bache del primer año) − pérdida de productividad por erosión.
 *  - Rango de años buenos y malos: más diversidad → menos variación.
 */
import type { CropId } from '@/lib/api/contract';
import type {
  Household,
  Milestone,
  OutlookRequestParsed,
  OutlookSite,
  OutlookStrategyInput,
  OutlookYear,
  Pace,
  Phase,
  SocialFactor,
  StrategyOutlook,
} from '@/lib/api/outlook';
import { capitalize, cropName } from '../engine/agronomy';
import { monthsLabel } from '../engine/recommend';
import {
  averageRow,
  cashCalendar,
  coversOf,
  cropsOf,
  cycleYearsOf,
  ESTABLISH_DAYS,
  foodCalendar,
  harvestedOf,
  laborRows,
  monthRows,
  perennialsOf,
  YEARS_TO_HARVEST,
} from './calendar';
import type { RefId } from './references';
import { traitsOf } from '@/features/rotations/mixed/traits';

export type Loc = 'es' | 'en';
export const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);

type Scores = OutlookStrategyInput['scores'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
/** "un mes" / "3 meses" (y en inglés "one month" / "3 months"). */
const monthsN = (n: number, l: Loc) =>
  n === 1 ? tr(l, 'un mes', 'one month') : tr(l, `${n} meses`, `${n} months`);

const listJoin = (xs: string[], l: Loc) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${tr(l, 'y', 'and')} ${xs.at(-1)}`;

// ---------------------------------------------------------------- constantes del modelo (docs/rotation-outlook.md)

/** 1 mm de suelo en una hectárea pesa ~13 t (densidad aparente 1,3 g/cm³). */
export const T_PER_MM = 13;
/** Pérdida de suelo que la formación de suelo alcanza a reponer (t/ha/año): 0,3–1,4 según Verheijen et al. 2009. */
export const TOLERABLE_T_HA = 1;
/** Productividad que se pierde por cada mm de suelo lavado: ~4 % por cada 10 cm (Bakker et al. 2004). */
const EROSION_YIELD_PER_MM = 0.0004;
/** Jornales al mes de una persona de la familia: un empleo agrícola de tiempo completo = 173 jornales al año (DANE 2011). */
export const DAYS_PER_WORKER = 14;
/** Tope del efecto rotación en el ingreso (las leguminosas en rotación suben ~20 % el rendimiento del cultivo siguiente). */
const MAX_ROTATION_GAIN = 0.15;

/** Parte del lote con la rotación nueva cada año. */
export function adoption(pace: Pace, year: number) {
  if (pace === 'all') return 1;
  return [0.25, 0.5][year - 1] ?? 1;
}

/** Materia orgánica típica (%) si no hay análisis de suelo: más en clima frío y húmedo, menos en zonas secas. */
export function defaultSom(site: OutlookSite | undefined) {
  const t = site?.tMeanC ?? null;
  const p = site?.annualPrecipMm ?? null;
  if ((site?.elevationM ?? 0) >= 2000 || (t != null && t < 14)) return 5;
  if (p != null && p < 500) return 1;
  if (p != null && p < 900) return 1.8;
  if (t != null && t >= 24) return 2.2;
  return 3;
}

/** Años que tarda la materia orgánica en hacer ~63 % del camino a su nuevo equilibrio (más rápido con calor). */
function somTau(site: OutlookSite | undefined) {
  const t = site?.tMeanC;
  if (t == null) return 18;
  return t >= 22 ? 12 : t < 12 ? 25 : 18;
}

const K_BY_TEXTURE = { sandy: 0.6, loam: 1, clay: 0.8, silt: 1.3, unknown: 1 } as const;

/**
 * Suelo que se lavaría al año con el suelo desnudo (t/ha): lluvia × pendiente × tipo de suelo, calibrado para que
 * una ladera andina lluviosa (2.000 mm, 30 %) dé ~150 t/ha y un llano casi nada.
 */
export function bareSoilLoss(site: OutlookSite | undefined, texture: keyof typeof K_BY_TEXTURE | undefined) {
  const p = site?.annualPrecipMm;
  const slope = site?.slopePct;
  const k = K_BY_TEXTURE[texture ?? 'unknown'];
  if (p == null && slope == null) {
    const byLevel = { low: 10, medium: 40, high: 120 } as const;
    return byLevel[site?.erosionLevel ?? 'medium'] * k;
  }
  const fR = clamp((p ?? 1200) / 2000, 0.2, 1.5);
  const fS = clamp(((slope ?? 4) + 2) / 32, 0.05, 1.5);
  return 150 * fR * fS * k;
}

/**
 * Factor de cobertura desde el puntaje de erosión (100 = suelo siempre protegido). Calibrado con las parcelas de
 * Cenicafé en Chinchiná (Rivera Posada 1996): cafetal sin cobertura ~15–25 t/ha/año, con cobertura < 1 t/ha/año.
 */
const coverFactor = (erosionScore: number) => 0.35 * ((100 - clamp(erosionScore, 0, 100)) / 100) ** 1.6;

/** Efecto rotación de largo plazo sobre el ingreso: más nitrógeno de leguminosas y menos plagas que antes. */
function rotationGain(s: Scores, cur: Scores) {
  const dn = Math.max(0, s.nitrogen - cur.nitrogen);
  const dp = Math.max(0, s.pestBreak - cur.pestBreak);
  return Math.min(MAX_ROTATION_GAIN, 0.0015 * dn + 0.001 * dp);
}

/** Familias botánicas distintas de lo que se cosecha (diversidad). */
function familiesOf(crops: CropId[]) {
  return new Set(crops.map((c) => traitsOf(c)?.family ?? c)).size;
}

// ---------------------------------------------------------------- una estrategia en el tiempo

type Ctx = {
  req: OutlookRequestParsed;
  l: Loc;
  /** La finca está en Colombia: se suman las fuentes colombianas. */
  colombia: boolean;
  current: OutlookStrategyInput;
  som0: number;
  somTau: number;
  bare: number;
  area: number;
  workers: number;
  mechanized: boolean;
  usual: Set<CropId>;
};

type Path = {
  years: OutlookYear[];
  income: number[];
  laborYear: number[];
  transitionEnd: number;
};

/** Costos de la parte del lote que cambia, por años desde que cambió (fracción del ingreso de hoy). */
function costProfile(s: OutlookStrategyInput, ctx: Ctx) {
  const curCrops = new Set(cropsOf(ctx.current.seasons));
  const newHarvested = harvestedOf(s.seasons).filter((c) => !curCrops.has(c) && !ctx.usual.has(c));
  const newCovers = coversOf(s.seasons).filter((c) => !curCrops.has(c));
  const newPerennials = perennialsOf(s.seasons).filter((c) => !curCrops.has(c));
  const harvestedPerennials = newPerennials.filter((c) => YEARS_TO_HARVEST[c] != null);
  const otherHarvest = harvestedOf(s.seasons).filter((c) => !harvestedPerennials.includes(c)).length;
  return {
    newHarvested,
    newCovers,
    newPerennials,
    harvestedPerennials,
    /** Costo del año k (1 = el año en que esa parte cambió). */
    at(k: number) {
      let c = 0;
      if (newHarvested.length) c += [0.1, 0.04][k - 1] ?? 0; // aprender un cultivo nuevo
      if (newCovers.length && k === 1) c += 0.03; // aprender a sembrar y cortar la cobertura
      for (const p of newPerennials) if (k === 1 && YEARS_TO_HARVEST[p] == null) c += 0.05; // sembrar sombra o cobertura viva
      for (const p of harvestedPerennials) {
        // Mientras el perenne nuevo no produce, esa parte del ingreso no llega.
        const share = otherHarvest > 0 ? 0.35 : 0.6;
        if (k <= YEARS_TO_HARVEST[p]!) c += share;
      }
      return c;
    },
    /** Costo que se repite cada año: semilla de cobertura. */
    yearly: newCovers.length ? 0.02 : 0,
  };
}

function project(s: OutlookStrategyInput, ctx: Ctx): Path {
  const { req, current: cur } = ctx;
  const H = req.horizonYears;
  const pace: Pace = s.isCurrent ? 'all' : req.pace;
  const cycleYears = cycleYearsOf(s.durationMonths);
  const rows = monthRows(s.seasons, cycleYears);
  const laborS = averageRow(laborRows(s.seasons, cycleYears, ctx.mechanized)).reduce((a, b) => a + b, 0);
  const laborC = averageRow(laborRows(cur.seasons, cycleYearsOf(cur.durationMonths), ctx.mechanized)).reduce(
    (a, b) => a + b,
    0,
  );
  const costs = costProfile(s, ctx);
  const g = s.isCurrent ? 0 : rotationGain(s.scores, cur.scores);
  const L = s.isCurrent ? 1 : (s.scores.income + 20) / (cur.scores.income + 20);
  const famS = familiesOf(harvestedOf(s.seasons));
  const famC = familiesOf(harvestedOf(cur.seasons));
  const transitionEnd = s.isCurrent
    ? 0
    : Math.max(1, pace === 'gradual' ? 2 : 1, ...costs.harvestedPerennials.map((p) => YEARS_TO_HARVEST[p]!));
  const buildingEnd = Math.max(transitionEnd + 1, 4, cycleYears * 2);
  // Cambio de equilibrio de la materia orgánica: lo de hoy se mueve según su propio puntaje (quemar, dejar desnudo).
  const rCur = 0.0025 * (cur.scores.soilOrganicMatter - 55);
  const step = 1 - Math.exp(-1 / ctx.somTau);
  const establish = costs.newPerennials.reduce((a, p) => a + (ESTABLISH_DAYS[p] ?? 0), 0);

  const years: OutlookYear[] = [];
  const income: number[] = [];
  const laborYear: number[] = [];
  let som = ctx.som0;
  let lostMm = 0;
  let productivity = 1;
  let prevA = 0;
  const converted: number[] = []; // parte del lote que cambió cada año

  for (let y = 1; y <= H; y++) {
    const a = s.isCurrent ? 0 : adoption(pace, y);
    converted.push(Math.max(0, a - prevA));
    prevA = a;
    const eff = (k: keyof Scores) => cur.scores[k] + a * (s.scores[k] - cur.scores[k]);

    // Materia orgánica
    const target = ctx.som0 * (1 + rCur + 0.005 * (eff('soilOrganicMatter') - cur.scores.soilOrganicMatter));
    som += (target - som) * step;
    const somSpread = Math.abs(som - ctx.som0) * 0.5 + ctx.som0 * 0.02;

    // Suelo que se lava (años de lluvia floja o fuerte: ×0,6 a ×1,6)
    const loss = ctx.bare * coverFactor(eff('erosion'));
    lostMm += loss / T_PER_MM;
    productivity = 1 - EROSION_YIELD_PER_MM * lostMm;

    // Ingreso neto (100 = lo de hoy en un año normal)
    const ramp = 1 - Math.exp(-y / 1.5);
    const adopted = a * L * (1 + g * ramp);
    let cost = a * costs.yearly;
    converted.forEach((d, j) => {
      if (d > 0) cost += d * costs.at(y - j);
    });
    const mid = 100 * (productivity * (1 - a + adopted) - cost);
    const fam = famC + a * (famS - famC);
    const phase: Phase = s.isCurrent
      ? 'stable'
      : y <= transitionEnd
        ? 'transition'
        : y <= buildingEnd
          ? 'building'
          : 'stable';
    const v =
      clamp(0.24 - 0.0012 * eff('pestBreak') - 0.025 * (fam - 1), 0.07, 0.3) +
      (phase === 'transition' ? 0.04 : 0);

    // Trabajo
    const newShare = converted.at(-1) ?? 0;
    const labor = (1 - a) * laborC + a * laborS + establish * newShare;

    years.push({
      year: y,
      cycleYear: ((y - 1) % cycleYears) + 1,
      phase,
      adopted: round(a, 2),
      months: rows[(y - 1) % cycleYears]!,
      soilOrganicMatterPct: {
        mid: round(som, 2),
        low: round(som - somSpread, 2),
        high: round(som + somSpread, 2),
      },
      soilLossTHa: { mid: round(loss), low: round(loss * 0.6), high: round(loss * 1.6) },
      soilLostMm: round(lostMm, 2),
      incomeIndex: {
        mid: round(mid),
        low: round(mid - Math.abs(mid) * v),
        high: round(mid + Math.abs(mid) * 0.6 * v),
      },
      laborDaysHa: round(labor, 0),
    });
    income.push(mid);
    laborYear.push(labor);
  }
  return { years, income, laborYear, transitionEnd };
}

/** Primer año en que el ingreso acumulado alcanza al de seguir como hoy (1 si nunca queda por debajo). */
function breakEven(income: number[], base: number[]) {
  let acc = 0;
  let dipped = false;
  for (let i = 0; i < income.length; i++) {
    acc += income[i]! - base[i]!;
    if (acc < -0.05) dipped = true;
    else if (dipped) return i + 1;
  }
  return dipped ? null : 1;
}

// ---------------------------------------------------------------- hitos

function milestones(s: OutlookStrategyInput, path: Path, be: number | null, ctx: Ctx): Milestone[] {
  const { l, req } = ctx;
  if (s.isCurrent) {
    const lost = path.years.at(-1)!.soilLostMm;
    const out: Milestone[] = [
      {
        year: Math.min(5, req.horizonYears),
        kind: 'soil-test',
        text: tr(
          l,
          'Haz un análisis de suelo para saber cómo va la materia orgánica.',
          'Get a soil test to see how organic matter is doing.',
        ),
        refIds: ['minasny-2017'] satisfies RefId[],
      },
    ];
    if (lost >= 1) {
      out.push({
        year: req.horizonYears,
        kind: 'soil-visible',
        text: tr(
          l,
          `Si sigues igual, en ${req.horizonYears} años se habrán ido ~${round(lost)} mm de la capa fértil, y un centímetro de suelo tarda siglos en formarse.`,
          `If nothing changes, ~${round(lost)} mm of topsoil will be gone in ${req.horizonYears} years, and one centimetre of soil takes centuries to form.`,
        ),
        refIds: ['montgomery-2007', 'rivera-posada-1996'] satisfies RefId[],
      });
    }
    return out;
  }
  const out: Milestone[] = [];
  const cycleYears = cycleYearsOf(s.durationMonths);
  const costs = costProfile(s, ctx);
  const gradual = req.pace === 'gradual';
  out.push({
    year: 1,
    kind: 'trial',
    text: gradual
      ? tr(
          l,
          'Año de prueba: la rotación nueva en ¼ del lote; el resto sigue como hoy.',
          'Trial year: the new rotation on ¼ of the plot; the rest stays as today.',
        )
      : tr(
          l,
          'Primer año: todo el lote cambia. Es el año de aprender y el ingreso puede bajar.',
          'First year: the whole plot changes. It is the learning year and income may dip.',
        ),
    refIds: (gradual ? ['pittelkow-2015-fcr', 'snapp-2010'] : ['pittelkow-2015-fcr']) satisfies RefId[],
  });
  if (gradual) {
    out.push({
      year: 3,
      kind: 'full-adoption',
      text: tr(
        l,
        'Todo el lote con la rotación nueva (año 2: la mitad).',
        'The whole plot on the new rotation (year 2: half).',
      ),
      refIds: [],
    });
  }
  for (const p of costs.harvestedPerennials) {
    const y = YEARS_TO_HARVEST[p]! + 1;
    if (y <= req.horizonYears) {
      out.push({
        year: y,
        kind: 'first-harvest',
        text: tr(
          l,
          `Primera cosecha del ${cropName(p, l)} nuevo.`,
          `First harvest of the new ${cropName(p, l)}.`,
        ),
        refIds: [],
      });
    }
  }
  if (cycleYears > 1) {
    out.push({
      year: cycleYears,
      kind: 'first-cycle',
      text: tr(
        l,
        `Primera vuelta completa de la rotación (${cycleYears} años); luego se repite.`,
        `First full turn of the rotation (${cycleYears} years); then it repeats.`,
      ),
      refIds: [],
    });
  }
  if (s.scores.pestBreak - ctx.current.scores.pestBreak >= 10) {
    out.push({
      year: Math.min(req.horizonYears, cycleYears + 1),
      kind: 'pest-break',
      text: tr(
        l,
        'Ya cambiaste de familia de cultivo una vuelta: el efecto rotación (menos plagas del suelo, mejor cosecha en años difíciles) empieza a notarse.',
        'You have switched crop families for a full turn: the rotation effect (fewer soil pests, better harvests in hard years) starts to show.',
      ),
      refIds: ['bowles-2020', 'zhao-2022'] satisfies RefId[],
    });
  }
  if (be != null && be > 1) {
    out.push({
      year: be,
      kind: 'break-even',
      text: tr(
        l,
        'Recuperas lo invertido: lo ganado desde el año 1 iguala a seguir como hoy.',
        'You recover the investment: what you earned since year 1 equals staying as today.',
      ),
      refIds: ['sare-2019'] satisfies RefId[],
    });
  }
  const visible = path.years.find((y) => y.soilOrganicMatterPct.mid - ctx.som0 >= 0.15);
  if (visible) {
    out.push({
      year: visible.year,
      kind: 'soil-visible',
      text: tr(
        l,
        'La materia orgánica ya subió lo suficiente para notarse en un análisis de suelo.',
        'Organic matter has risen enough to show up in a soil test.',
      ),
      refIds: (ctx.colombia
        ? ['poeplau-don-2015', 'mcdaniel-2014', 'castro-rincon-2018']
        : ['poeplau-don-2015', 'mcdaniel-2014']) satisfies RefId[],
    });
  }
  out.push({
    year: Math.min(5, req.horizonYears),
    kind: 'soil-test',
    text: tr(
      l,
      'Haz un análisis de suelo antes de empezar y otro aquí para medir el cambio.',
      'Test your soil before you start and again here to measure the change.',
    ),
    refIds: ['minasny-2017'] satisfies RefId[],
  });
  return out.sort((a, b) => a.year - b.year);
}

// ---------------------------------------------------------------- factores sociales

function socialFactors(
  s: OutlookStrategyInput,
  path: Path,
  be: number | null,
  labor: StrategyOutlook['labor'],
  food: StrategyOutlook['food'],
  cash: StrategyOutlook['cash'],
  base: { labor: StrategyOutlook['labor']; food: StrategyOutlook['food']; cash: StrategyOutlook['cash'] },
  ctx: Ctx,
): SocialFactor[] {
  const { l, req } = ctx;
  const hh: Household = req.household ?? { workers: null, tenure: null, association: null };
  const out: SocialFactor[] = [];
  const peakNeed = Math.max(...labor.farmByMonth);
  const yearDays = labor.perHaByMonth.reduce((a, b) => a + b, 0);
  const baseDays = base.labor.perHaByMonth.reduce((a, b) => a + b, 0);
  const laborChange = baseDays > 0 ? (yearDays - baseDays) / baseDays : 0;
  const pct = Math.round(Math.abs(laborChange) * 100);
  const allYear = labor.peakMonths.length === 12;
  const peak = monthsLabel(labor.peakMonths, l);
  const inPeak = allYear ? tr(l, 'Todo el año', 'All year round') : tr(l, `En ${peak}`, `In ${peak}`);

  // 1. Mano de obra
  {
    const hired = Math.round(labor.hiredDaysYear);
    // Más de 10 % (y al menos 5 jornales) por encima de lo que ya se contrata hoy.
    const moreHired = hired > base.labor.hiredDaysYear * 1.1 + 5;
    const status: SocialFactor['status'] = moreHired
      ? 'alert'
      : peakNeed >= 0.8 * labor.familyPerMonth || laborChange >= 0.15
        ? 'watch'
        : 'good';
    const change = s.isCurrent
      ? ''
      : laborChange >= 0.05
        ? tr(l, ` Es ${pct} % más trabajo que hoy.`, ` That is ${pct}% more work than today.`)
        : laborChange <= -0.05
          ? tr(l, ` Es ${pct} % menos trabajo que hoy.`, ` That is ${pct}% less work than today.`)
          : tr(l, ' Es casi el mismo trabajo que hoy.', ' About the same work as today.');
    const text =
      hired > 0
        ? tr(
            l,
            `${inPeak} la finca pide hasta ~${Math.round(peakNeed)} jornales al mes y la familia da ~${Math.round(labor.familyPerMonth)}: habría que contratar ~${hired} jornales al año.${change}`,
            `${inPeak} the farm needs up to ~${Math.round(peakNeed)} workdays a month and the family gives ~${Math.round(labor.familyPerMonth)}: you would hire ~${hired} workdays a year.${change}`,
          )
        : tr(
            l,
            `El mes de más trabajo es ${peak} (~${Math.round(peakNeed)} jornales); la familia alcanza (~${Math.round(labor.familyPerMonth)} al mes).${change}`,
            `The busiest month is ${peak} (~${Math.round(peakNeed)} workdays); the family can cover it (~${Math.round(labor.familyPerMonth)} a month).${change}`,
          );
    const crops = cropsOf(s.seasons);
    const refIds: RefId[] = ['dane-2011-jornales'];
    if (crops.includes('beans')) refIds.push('upra-2023-frijol');
    if (crops.includes('cassava')) refIds.push('upra-2023-yuca');
    if (ctx.colombia && hired > 0) refIds.push('dane-cna-2014-envejecimiento');
    out.push({ kind: 'labor', status, title: tr(l, 'Mano de obra', 'Labor'), text, refIds });
  }

  if (s.isCurrent) {
    if (food.gapMonths.length) {
      out.push({
        kind: 'food',
        status: 'watch',
        title: tr(l, 'Comida para la casa', 'Food for the home'),
        text: tr(
          l,
          `Hoy hay ${monthsN(food.gapMonths.length, l)} sin comida de la finca (${monthsLabel(food.gapMonths, l)}): son los meses de comprar todo.`,
          `Today there ${food.gapMonths.length === 1 ? 'is' : 'are'} ${monthsN(food.gapMonths.length, l)} without food from the farm (${monthsLabel(food.gapMonths, l)}): months when you buy everything.`,
        ),
        refIds: ['vaitla-2009'] satisfies RefId[],
      });
    }
    return out;
  }

  // 2. Tenencia de la tierra: lo que se invierte en el suelo tarda en pagarse.
  {
    const slow =
      (be ?? 99) >= 3 || perennialsOf(s.seasons).some((p) => !cropsOf(ctx.current.seasons).includes(p));
    const payoff =
      be == null
        ? tr(l, `más de ${req.horizonYears} años`, `more than ${req.horizonYears} years`)
        : be === 1
          ? tr(l, 'un año', 'one year')
          : tr(l, `${be} años`, `${be} years`);
    if (hh.tenure === 'own') {
      out.push({
        kind: 'tenure',
        status: 'good',
        title: tr(l, 'La tierra es tuya', 'The land is yours'),
        text: tr(
          l,
          'Lo que ganes en suelo (materia orgánica, menos erosión) se queda en tu finca.',
          'What you gain in soil (organic matter, less erosion) stays on your farm.',
        ),
        refIds: ['higgins-2018'] satisfies RefId[],
      });
    } else if (hh.tenure === 'rent' || hh.tenure === 'shared') {
      out.push({
        kind: 'tenure',
        status: slow ? 'alert' : 'watch',
        title: tr(
          l,
          hh.tenure === 'rent' ? 'Tierra arrendada' : 'Tierra en compañía',
          hh.tenure === 'rent' ? 'Rented land' : 'Sharecropped land',
        ),
        text: slow
          ? tr(
              l,
              `Esta opción tarda ${payoff} en pagarse. Si el acuerdo es corto, conversa un contrato de varios años o empieza por lo que paga el mismo año (una leguminosa que se vende).`,
              `This option takes ${payoff} to pay off. If the agreement is short, discuss a multi-year contract or start with what pays the same year (a legume you can sell).`,
            )
          : tr(
              l,
              'Se paga rápido, pero la mejora del suelo se queda en la tierra: acuerda con el dueño quién se beneficia.',
              'It pays back fast, but the soil improvement stays with the land: agree with the owner on who benefits.',
            ),
        refIds: ['higgins-2018', 'lawry-2017'] satisfies RefId[],
      });
    } else {
      out.push({
        kind: 'tenure',
        status: 'watch',
        title: tr(l, '¿La tierra es propia?', 'Do you own the land?'),
        text: tr(
          l,
          `Cambia lo que conviene: esta opción tarda ${payoff} en pagarse y la mejora del suelo se queda en la tierra.`,
          `It changes what makes sense: this option takes ${payoff} to pay off and the soil improvement stays with the land.`,
        ),
        refIds: ['higgins-2018'] satisfies RefId[],
      });
    }
  }

  // 3. Comida para la casa
  {
    const purpose = req.field.survey?.purpose ?? null;
    const diff = base.food.gapMonths.length - food.gapMonths.length;
    const status: SocialFactor['status'] =
      diff > 0
        ? 'good'
        : diff < 0
          ? purpose === 'sale'
            ? 'watch'
            : 'alert'
          : food.gapMonths.length
            ? 'watch'
            : 'good';
    const text =
      diff > 0
        ? tr(
            l,
            `Hay comida de la finca ${monthsN(12 - food.gapMonths.length, l)} del año (hoy ${12 - base.food.gapMonths.length}): menos meses de comprar todo.`,
            `There is food from the farm ${monthsN(12 - food.gapMonths.length, l)} a year (today ${12 - base.food.gapMonths.length}): fewer months buying everything.`,
          )
        : diff < 0
          ? tr(
              l,
              `${food.gapMonths.length === 1 ? 'Queda' : 'Quedan'} ${monthsN(food.gapMonths.length, l)} sin comida de la finca (hoy ${base.food.gapMonths.length}): ${monthsLabel(food.gapMonths, l)}.`,
              `${capitalize(monthsN(food.gapMonths.length, l))} without food from the farm (today ${base.food.gapMonths.length}): ${monthsLabel(food.gapMonths, l)}.`,
            )
          : food.gapMonths.length
            ? tr(
                l,
                `Como hoy, ${food.gapMonths.length === 1 ? 'queda' : 'quedan'} ${monthsN(food.gapMonths.length, l)} sin comida de la finca: ${monthsLabel(food.gapMonths, l)}.`,
                `As today, ${monthsN(food.gapMonths.length, l)} without food from the farm: ${monthsLabel(food.gapMonths, l)}.`,
              )
            : tr(l, 'Hay comida de la finca todo el año.', 'There is food from the farm all year.');
    const extra =
      food.families > base.food.families
        ? tr(
            l,
            ` Y más variada: ${food.families === 1 ? 'un grupo' : `${food.families} grupos`} de cultivos (hoy ${base.food.families}).`,
            ` And more varied: ${food.families === 1 ? 'one crop group' : `${food.families} crop groups`} (today ${base.food.families}).`,
          )
        : '';
    out.push({
      kind: 'food',
      status,
      title: tr(l, 'Comida para la casa', 'Food for the home'),
      text: text + extra,
      refIds: ['vaitla-2009', 'waha-2018'] satisfies RefId[],
    });
  }

  // 4. Dinero a lo largo del año
  {
    const n = cash.months.filter(Boolean).length;
    const nb = base.cash.months.filter(Boolean).length;
    out.push({
      kind: 'cash',
      status: n > nb ? 'good' : n < nb ? 'watch' : 'good',
      title: tr(l, 'Dinero durante el año', 'Money through the year'),
      text:
        n > nb
          ? tr(
              l,
              `Vendes en ${monthsN(n, l)} del año (hoy ${nb}): el dinero no depende de una sola cosecha.`,
              `You sell in ${monthsN(n, l)} of the year (today ${nb}): money does not depend on a single harvest.`,
            )
          : n < nb
            ? tr(
                l,
                `Vendes en ${monthsN(n, l)} del año (hoy ${nb}): planea el dinero para los meses sin venta.`,
                `You sell in ${monthsN(n, l)} of the year (today ${nb}): plan money for the months without sales.`,
              )
            : tr(
                l,
                `Vendes en ${monthsN(n, l)} del año, como hoy.`,
                `You sell in ${monthsN(n, l)} of the year, as today.`,
              ),
      refIds: ['gaudin-2015', 'bowles-2020'] satisfies RefId[],
    });
  }

  // 5. Mercado: ¿quién compra lo nuevo?
  {
    const costs = costProfile(s, ctx);
    const markets = new Set(req.priorities.constraints.markets);
    const unsold = costs.newHarvested.filter((c) => !markets.has(c));
    if (unsold.length || hh.association) {
      const names = listJoin(
        unsold.map((c) => cropName(c, l)),
        l,
      );
      out.push({
        kind: 'market',
        status: unsold.length ? 'watch' : 'good',
        title: tr(l, '¿Quién compra?', 'Who buys?'),
        text: unsold.length
          ? tr(
              l,
              `Antes de sembrar ${names}, averigua quién lo compra y a qué precio.${hh.association ? ' Con tu asociación pueden vender juntos.' : ' Vender en grupo (asociación) ayuda.'}`,
              `Before sowing ${names}, find out who buys it and at what price.${hh.association ? ' Your association can sell together.' : ' Selling as a group (association) helps.'}`,
            )
          : tr(
              l,
              'Con tu asociación pueden comprar semilla y vender juntos.',
              'With your association you can buy seed and sell together.',
            ),
        refIds: ['knowler-bradshaw-2007'] satisfies RefId[],
      });
    }
  }

  // 6. Saber hacerlo
  {
    const costs = costProfile(s, ctx);
    const novel = [...costs.newHarvested, ...costs.newCovers.filter((c) => !ctx.usual.has(c))];
    if (novel.length) {
      const names = listJoin(
        [...new Set(novel)].map((c) => cropName(c, l)),
        l,
      );
      out.push({
        kind: 'knowledge',
        status: 'watch',
        title: tr(l, 'Algo nuevo para aprender', 'Something new to learn'),
        text: tr(
          l,
          `${capitalize(names)} ${novel.length > 1 ? 'son nuevos' : 'es nuevo'} para ti: aprender lleva 1–2 cosechas. Pide acompañamiento (escuela de campo, técnico del municipio) y prueba primero en una parte del lote.`,
          `${capitalize(names)} ${novel.length > 1 ? 'are' : 'is'} new to you: learning takes 1–2 harvests. Ask for support (farmer field school, local extension) and try it on part of the plot first.`,
        ),
        refIds: ['waddington-2014', 'prokopy-2019'] satisfies RefId[],
      });
    }
  }

  // 7. Quién hace el trabajo nuevo y quién decide sobre lo que se gana
  if (laborChange >= 0.15 || coversOf(s.seasons).some((c) => !cropsOf(ctx.current.seasons).includes(c))) {
    out.push({
      kind: 'workload',
      status: 'watch',
      title: tr(l, 'Quién hace las tareas nuevas', 'Who does the new tasks'),
      text: tr(
        l,
        'Las tareas nuevas (sembrar y cortar la cobertura, más deshierbe o cosecha) suman trabajo. Repártanlas en familia y decidan juntos sobre lo que se gana: en el campo, las mujeres suelen recibir menos pago por el mismo trabajo.',
        'New tasks (sowing and cutting the cover, more weeding or harvest) add work. Share them as a family and decide together on what is earned: in farming, women are often paid less for the same work.',
      ),
      refIds: (ctx.colombia
        ? ['fao-2023-women', 'dane-cna-2014-productoras']
        : ['fao-2023-women']) satisfies RefId[],
    });
  }

  return out;
}

// ---------------------------------------------------------------- todas las estrategias

export function strategyOutlooks(req: OutlookRequestParsed, l: Loc, colombia: boolean) {
  const current = req.strategies.find((s) => s.isCurrent)!;
  const soil = req.field.soil;
  const som0 = soil?.organicMatterPct ?? defaultSom(req.site);
  const area = req.field.areaHa ?? 1;
  const workers = req.household?.workers ?? 2;
  const equipment = req.priorities.constraints.equipment;
  const ctx: Ctx = {
    req,
    l,
    colombia,
    current,
    som0,
    somTau: somTau(req.site),
    bare: bareSoilLoss(req.site, soil?.texture),
    area,
    workers,
    mechanized: equipment.includes('tractor') || equipment.includes('seed-drill'),
    usual: new Set(req.field.survey?.usualCrops ?? []),
  };

  const calendars = (s: OutlookStrategyInput) => {
    const years = cycleYearsOf(s.durationMonths);
    const perHa = averageRow(laborRows(s.seasons, years, ctx.mechanized));
    const farm = perHa.map((v) => v * area);
    const family = workers * DAYS_PER_WORKER;
    const max = Math.max(...farm);
    const over = farm.flatMap((v, i) => (v > family ? [i + 1] : []));
    const peakMonths = over.length
      ? over
      : farm.flatMap((v, i) => (max > 0 && v >= max * 0.9 ? [i + 1] : []));
    const labor: StrategyOutlook['labor'] = {
      perHaByMonth: perHa.map((v) => round(v)),
      farmByMonth: farm.map((v) => round(v)),
      familyPerMonth: family,
      peakMonths,
      hiredDaysYear: round(
        farm.reduce((a, v) => a + Math.max(0, v - family), 0),
        0,
      ),
    };
    return {
      labor,
      food: foodCalendar(s.seasons),
      cash: cashCalendar(s.seasons, req.priorities.constraints.markets),
    };
  };

  const base = calendars(current);
  const basePath = project(current, ctx);
  const outlooks: StrategyOutlook[] = req.strategies.map((s) => {
    const path = s.isCurrent ? basePath : project(s, ctx);
    const be = s.isCurrent ? 1 : breakEven(path.income, basePath.income);
    const cal = s.isCurrent ? base : calendars(s);
    return {
      strategyId: s.id,
      cycleYears: cycleYearsOf(s.durationMonths),
      years: path.years,
      milestones: milestones(s, path, be, ctx),
      breakEvenYear: be,
      labor: cal.labor,
      food: cal.food,
      cash: cal.cash,
      social: socialFactors(s, path, be, cal.labor, cal.food, cal.cash, base, ctx),
      confidence: lowerIf(s.confidence, soil?.organicMatterPct == null && req.field.areaHa == null),
    };
  });

  return { outlooks, ctx };
}

function lowerIf(c: OutlookStrategyInput['confidence'], cond: boolean): OutlookStrategyInput['confidence'] {
  if (!cond) return c;
  return c === 'high' ? 'medium' : 'low';
}
