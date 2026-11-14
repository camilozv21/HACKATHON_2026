/**
 * Los 7 puntajes (0–100) de una rotación en ESTA finca. Nada está escrito a mano: todo sale del calendario mes a mes,
 * del clima del sitio y de los rasgos de cada cultivo. La misma cuenta se aplica a lo que haces hoy y a cada opción,
 * así que las diferencias son comparables. Ver docs/recommendation-engine.md.
 *
 *  agua        100·e^(−R/500), R = riego que haría falta al año (balance FAO-56: ET0·Kc frente a la lluvia que entra,
 *              con una cubeta de 130 mm por metro de raíz). Arroz inundado: +120 mm/mes de percolación.
 *  materia org. raíces vivas (meses/año) + rastrojo que vuelve al suelo + perennes, − quema.
 *  nitrógeno   leguminosas (más si son cobertura que se incorpora) + cobertura que atrapa el N en meses de lavado
 *              + cultivo exigente después o al lado de una leguminosa − cultivos exigentes sin leguminosa.
 *  erosión     lógica RUSLE: lluvia erosiva (Fournier) × pendiente × (1 − cobertura en los meses de lluvia fuerte).
 *  plagas      cambios de familia entre cultivos seguidos, número de cultivos y familias, asociaciones y coberturas.
 *  ingresos    Σ valor relativo × rendimiento esperado (frío/calor/agua, FAO-33 Ky) × parte de la asociación (LER)
 *              × ajuste local de mercado en Colombia (SIPSA + EVA, acotado 0,5–1,5; ./market.ts).
 *  forraje     coberturas y forrajes pastoreables por mes + rastrojo de los granos.
 */
import type { CropId, CropSeason, FarmerPriorities, ScoreKey } from '@/lib/api/contract';
import type { MonthlyClimate } from '@/features/rotations/mixed/climate';
import { pairsOf } from '@/features/rotations/mixed/relations';
import { crop, isHungry, isLegume, monthFit } from './agronomy';
import { seasonAbs, seasonLength } from './schedule';
import { siteErosionSeverity, type Site } from './site';
import type { SystemFlags } from './systems';

export type Irrigation = FarmerPriorities['constraints']['irrigation'];

export type EvalCtx = {
  site: Site;
  clim: MonthlyClimate;
  irrigation: Irrigation;
  /** Rastrojo que queda en el suelo: 1 se deja · 0.6 se pastorea · 0.3 se retira · 0.1 se quema. */
  retention: number;
  markets: string[];
  flags?: SystemFlags;
  /** Ajuste local del ingreso por cultivo (mercado de Colombia, ./market.ts). Sin él, 1. */
  marketFactor?: Partial<Record<CropId, number>>;
};

export type Stress = 'cold' | 'heat' | 'frost' | 'dry' | 'wet';

export type SeasonFit = {
  season: CropSeason;
  months: number[];
  /** 0–1: temperatura, heladas y meses muy lluviosos (misma cuenta que la UI de asociaciones). */
  thermal: number;
  /** 0–1: parte del agua que pide el cultivo que cubre la lluvia (o el riego). */
  water: number;
  /** 0–1: rendimiento esperado frente al máximo. */
  yield: number;
  stress: Stress | null;
};

export type Evaluation = {
  scores: Record<ScoreKey, number>;
  fits: SeasonFit[];
  /** mm de riego al año para que los cultivos no sufran. */
  irrigationMm: number;
  /** mm al año que les faltan a las coberturas (compiten por agua). */
  coverDeficitMm: number;
  /** Meses al año con el suelo cubierto (cobertura ≥ 40 %). */
  coveredMonths: number;
  /** Meses del calendario sin cultivo vivo (en la mitad de los años o más). */
  bareMonths: number[];
  monthly: { month: number; waterUseMm: number; soilCovered: boolean }[];
  /** Uso equivalente de la tierra de la mejor asociación (null si no hay). */
  ler: number | null;
  legumes: CropId[];
};

const MAIN_ROLES = new Set<CropSeason['role']>(['cash', 'perennial', 'intercrop']);
const PERENNIAL_SOM = new Set<CropId>(['coffee', 'plantain', 'sugarcane', 'pasture', 'alfalfa', 'shade-trees', 'forage-peanut']);
/** Agua útil que guarda el suelo por metro de raíz (franco: ~130 mm/m, FAO-56 tabla 19). */
const TAW_MM_PER_M = 130;
const RICE_PERCOLATION_MM = 120;

const clamp100 = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Un perenne escrito solo en el año 1 sigue ahí los demás años. */
function expandPerennials(seasons: CropSeason[], years: number): CropSeason[] {
  if (years === 1) return seasons;
  const out = [...seasons];
  for (const s of seasons) {
    if (!crop(s.crop).t.perennial || seasonLength(s) < 12) continue;
    for (let y = 1; y <= years; y++) {
      if (!out.some((o) => o.crop === s.crop && (o.year ?? 1) === y && seasonLength(o) === 12)) out.push({ ...s, year: y });
    }
  }
  return out;
}

/** Uso equivalente de la tierra (LER) de una mezcla: 1 + 0.1 × valor medio de las parejas × (n − 1). */
export function lerOf(crops: CropId[]): number {
  const unique = [...new Set(crops)];
  if (unique.length < 2) return 1;
  const pairs = pairsOf(unique);
  const mean = pairs.reduce((a, p) => a + p.value, 0) / pairs.length;
  let ler = 1 + 0.1 * mean * (unique.length - 1);
  const cerealLegume = pairs.some(
    (p) => p.curated && ((isLegume(p.a) && crop(p.b).t.family === 'grass') || (isLegume(p.b) && crop(p.a).t.family === 'grass')),
  );
  if (cerealLegume) ler = Math.max(ler, 1.25);
  return Math.round(Math.min(1.5, Math.max(0.75, ler)) * 100) / 100;
}

export function evaluate(input: CropSeason[], durationMonths: number, ctx: EvalCtx): Evaluation {
  const { site, clim } = ctx;
  const flags = ctx.flags ?? {};
  const years = Math.max(1, Math.round(durationMonths / 12));
  const total = years * 12;
  const seasons = expandPerennials(input, years);
  const lens = seasons.map(seasonLength);
  const starts = seasons.map(seasonAbs);
  const shaded = seasons.some((s) => s.crop === 'shade-trees');
  const shadeClim: MonthlyClimate = { ...clim, tMean: clim.tMean.map((t) => (t == null ? t : t - 2)) };
  const retention = flags.mulch ? 1 : flags.burn ? 0.1 : ctx.retention;

  // ------------------------------------------------ calendario mes a mes
  type Entry = { i: number; k: number };
  const grid: Entry[][] = Array.from({ length: total }, () => []);
  seasons.forEach((s, i) => {
    if (s.role === 'fallow') return;
    for (let k = 0; k < lens[i]!; k++) grid[(starts[i]! + k) % total]!.push({ i, k });
  });
  const stage = (e: Entry) => (lens[e.i]! >= 12 ? 1 : e.k === 0 ? 0.35 : e.k === 1 ? 0.7 : 1);
  const isFloodedRice = (s: CropSeason) => s.crop === 'rice' && s.role === 'cash' && !flags.directSeededRice;

  // Mantillo: el rastrojo de lo que se cosechó (o de la cobertura que se terminó) protege unos meses.
  const mulch = new Array<number>(total).fill(0);
  const decay = flags.mulch ? 0.85 : 0.6;
  seasons.forEach((s, i) => {
    if (s.role === 'fallow' || lens[i]! >= 12) return;
    const kept = s.role === 'cover' ? 1 : retention;
    const r = crop(s.crop).a.residue * kept * 0.6;
    const end = starts[i]! + lens[i]! - 1;
    for (let g = 1; g <= 4; g++) {
      const p = (end + g) % total;
      mulch[p] = Math.max(mulch[p]!, r * decay ** (g - 1));
    }
  });

  const cover = new Array<number>(total).fill(0);
  const etc = new Array<number>(total).fill(0);
  const cropMonth = new Array<boolean>(total).fill(false);
  for (let p = 0; p < total; p++) {
    const sm = site.months[p % 12]!;
    const cell = grid[p]!;
    let bare = 1;
    let kc = 0;
    let extra = 0;
    for (const e of cell) {
      const s = seasons[e.i]!;
      const c = crop(s.crop);
      // Un cultivo que crece mal ese mes (frío, calor, o una cobertura que el invierno mató) cubre menos.
      const vigor = 0.4 + 0.6 * monthFit(s.crop, (p % 12) + 1, shaded && s.crop !== 'shade-trees' ? shadeClim : clim, ctx.irrigation);
      bare *= 1 - c.a.canopy * stage(e) * vigor;
      const k = c.a.kc * (e.k === 0 && lens[e.i]! < 12 ? 0.6 : 1) * (shaded && s.crop !== 'shade-trees' ? 0.9 : 1);
      kc = Math.max(kc, k);
      if (isFloodedRice(s)) extra = RICE_PERCOLATION_MM;
      if (MAIN_ROLES.has(s.role) || s.role === 'forage') cropMonth[p] = true;
    }
    cover[p] = 1 - bare * (1 - mulch[p]!);
    etc[p] = cell.length
      ? sm.et0 * Math.min(1.3, kc + 0.1 * (cell.length - 1)) + extra
      : sm.et0 * (mulch[p]! > 0.2 ? 0.15 : 0.25);
  }

  // ------------------------------------------------ balance de agua (cubeta de suelo, dos vueltas para arrancar)
  // Lo que cabe en la cubeta depende de qué tan hondo llegan las raíces de los cultivos principales.
  const roots = seasons
    .filter((s) => MAIN_ROLES.has(s.role) || s.role === 'forage')
    .map((s) => crop(s.crop).t.rootM)
    .sort((a, b) => a - b);
  const rootM = roots.length ? roots[Math.floor(roots.length / 2)]! : 0.8;
  const TAW_MM = Math.min(220, Math.max(80, TAW_MM_PER_M * rootM));
  const deficit = new Array<number>(total).fill(0);
  let store = TAW_MM / 2;
  for (let pass = 0; pass < 2; pass++) {
    for (let p = 0; p < total; p++) {
      const sm = site.months[p % 12]!;
      const input = sm.peff * (flags.zai && grid[p]!.length ? 1.3 : 1);
      store += input - etc[p]!;
      let d = 0;
      if (store < 0) {
        d = -store;
        store = 0;
      } else if (store > TAW_MM) store = TAW_MM;
      if (pass === 1) deficit[p] = grid[p]!.length ? d : 0;
    }
  }
  let irr = 0;
  let coverDef = 0;
  for (let p = 0; p < total; p++) {
    if (cropMonth[p]) irr += deficit[p]!;
    else coverDef += deficit[p]!;
  }
  const irrigationMm = Math.round(irr / years);
  const coverDeficitMm = Math.round(coverDef / years);

  // ------------------------------------------------ ¿se da cada cultivo? (temperatura × agua)
  const fits: SeasonFit[] = seasons.map((s, i) => {
    const pos = Array.from({ length: lens[i]! }, (_, k) => (starts[i]! + k) % total);
    const months = pos.map((p) => (p % 12) + 1);
    const c = crop(s.crop);
    const cl = shaded && s.crop !== 'shade-trees' ? shadeClim : clim;
    const thermal = s.role === 'fallow' ? 1 : months.reduce((a, m) => a + monthFit(s.crop, m, cl, ctx.irrigation), 0) / months.length;
    const need = pos.reduce((a, p) => a + etc[p]!, 0);
    const short = pos.reduce((a, p) => a + deficit[p]!, 0);
    const rainfed = need > 0 ? clamp01(1 - short / need) : 1;
    const water = ctx.irrigation === 'full' ? 1 : ctx.irrigation === 'limited' ? 1 - (1 - rainfed) * 0.5 : rainfed;
    const yieldF = s.role === 'fallow' ? 1 : thermal * clamp01(1 - c.a.ky * (1 - water));
    let stress: Stress | null = null;
    if (thermal < 0.75) {
      const temps = months.map((m) => site.months[m - 1]!.t);
      const frosty = !c.t.frostOk && months.some((m) => site.months[m - 1]!.frost >= 1);
      stress = frosty ? 'frost' : Math.min(...temps) < c.t.tempC[0] ? 'cold' : Math.max(...temps) > c.t.tempC[1] ? 'heat' : 'wet';
    } else if (water < 0.7) stress = 'dry';
    return { season: s, months, thermal, water, yield: yieldF, stress };
  });

  // ------------------------------------------------ materia orgánica
  const living = grid.filter((c) => c.length > 0).length / total;
  let residueIn = 0;
  seasons.forEach((s, i) => {
    if (s.role === 'fallow') return;
    const f = fits[i]!;
    const growing = f.months.filter((m) => monthFit(s.crop, m, clim, ctx.irrigation) >= 0.6).length;
    const kept = s.role === 'cover' || lens[i]! >= 12 ? 1 : retention;
    residueIn += crop(s.crop).a.residue * kept * Math.min(1.5, growing / 4) * (0.5 + 0.5 * f.yield);
  });
  residueIn /= years;
  const hasPerennial = seasons.some((s) => PERENNIAL_SOM.has(s.crop) && lens[seasons.indexOf(s)]! >= 12);
  const intercropped = grid.some((c) => c.filter((e) => MAIN_ROLES.has(seasons[e.i]!.role)).length >= 2);
  const som = 8 + 30 * living + 45 * Math.min(1, residueIn / 2) + 10 * (hasPerennial ? 1 : 0) + 5 * (intercropped ? 1 : 0) - (retention <= 0.1 ? 10 : 0);

  // ------------------------------------------------ nitrógeno
  const legumeIdx = seasons.map((s, i) => (s.role !== 'fallow' && isLegume(s.crop) ? i : -1)).filter((i) => i >= 0);
  const W: Record<CropSeason['role'], number> = { cover: 1, intercrop: 0.6, cash: 0.5, perennial: 0.6, forage: 0.8, fallow: 0 };
  const nfix =
    legumeIdx.reduce((a, i) => a + W[seasons[i]!.role] * Math.min(1, lens[i]! / 4) * (0.4 + 0.6 * fits[i]!.thermal), 0) / years;
  const nfix01 = Math.min(1, nfix / 0.8);
  const leach = new Set(site.leachMonths);
  let catchN = 0;
  seasons.forEach((s, i) => {
    if (s.role !== 'cover') return;
    if (fits[i]!.months.some((m) => leach.has(m))) catchN = Math.max(catchN, isLegume(s.crop) ? 0.5 : 1);
  });
  const hungry = seasons.map((s, i) => (MAIN_ROLES.has(s.role) && isHungry(s.crop) ? i : -1)).filter((i) => i >= 0);
  const helped = hungry.filter((h) =>
    legumeIdx.some((l) => {
      const end = starts[l]! + lens[l]! - 1;
      const gap = (((starts[h]! - end) % total) + total) % total;
      const overlaps = fits[l]!.months.some((m) => fits[h]!.months.includes(m)) && (seasons[l]!.year ?? 1) === (seasons[h]!.year ?? 1);
      return gap <= 4 || overlaps;
    }),
  ).length;
  const mains = seasons.filter((s) => MAIN_ROLES.has(s.role) || s.role === 'forage');
  const precede = hungry.length ? helped / hungry.length : legumeIdx.length ? 1 : 0;
  const hungryShare = hungry.length / Math.max(1, mains.length);
  const nitrogen = 22 + 40 * nfix01 + 12 * catchN + 14 * precede - 12 * hungryShare * (1 - nfix01);

  // ------------------------------------------------ erosión (RUSLE simplificada)
  const p2 = site.months.map((m) => m.p * m.p);
  const sumP2 = p2.reduce((a, b) => a + b, 0) || 1;
  const weight = p2.map((v) => 0.7 * (v / sumP2) + 0.3 / 12);
  const protection = cover.reduce((a, c, p) => a + weight[p % 12]! * c, 0) / years;
  const riskWeight = 0.55 + 0.45 * siteErosionSeverity(site);
  const erosion = 100 * (1 - 1.4 * riskWeight * (1 - protection));

  // ------------------------------------------------ corte de plagas
  const seq = seasons
    .map((s, i) => ({ s, at: starts[i]! }))
    .filter(({ s }) => (s.role === 'cash' || s.role === 'perennial' || s.role === 'forage') && crop(s.crop).t.food !== false)
    .sort((a, b) => a.at - b.at)
    .map(({ s }) => s);
  let breakRatio = 0;
  if (seq.length > 1) {
    let sumB = 0;
    for (let i = 0; i < seq.length; i++) {
      const a = seq[i]!;
      const b = seq[(i + 1) % seq.length]!;
      sumB += a.crop === b.crop ? 0 : crop(a.crop).t.family !== crop(b.crop).t.family ? 1 : 0.4;
    }
    breakRatio = sumB / seq.length;
  }
  const distinctCrops = new Set(seq.map((s) => s.crop)).size;
  const families = new Set(seasons.filter((s) => s.role !== 'fallow').map((s) => crop(s.crop).t.family)).size;
  const covers = seasons.map((s, i) => ({ s, i })).filter(({ s }) => s.role === 'cover');
  const coverBreak = covers.length
    ? covers.some(({ s, i }) => {
        const end = starts[i]! + lens[i]!;
        const next = seq
          .map((m) => ({ m, d: (((seasonAbs(m) - end) % total) + total) % total }))
          .sort((a, b) => a.d - b.d)[0]?.m;
        return next ? crop(next.crop).t.family !== crop(s.crop).t.family : true;
      })
      ? 1
      : 0.5
    : 0;
  const pestBreak =
    15 +
    40 * breakRatio +
    10 * Math.min(1, (distinctCrops - 1) / 3) +
    10 * Math.min(1, (families - 1) / 2) +
    15 * (intercropped ? 1 : 0) +
    10 * coverBreak;

  // ------------------------------------------------ ingresos (relativos)
  let bestLer: number | null = null;
  let income = 0;
  const markets = new Set(ctx.markets);
  seasons.forEach((s, i) => {
    if (!MAIN_ROLES.has(s.role)) return;
    const c = crop(s.crop);
    if (c.a.value <= 0) return;
    const mine = fits[i]!.months;
    const partners = seasons
      .map((o, j) => ({ o, j }))
      .filter(
        ({ o, j }) =>
          j !== i &&
          MAIN_ROLES.has(o.role) &&
          (o.year ?? 1) === (s.year ?? 1) &&
          fits[j]!.months.filter((m) => mine.includes(m)).length >= Math.ceil(Math.min(mine.length, lens[j]!) / 2),
      );
    let share = 1;
    if (partners.length) {
      const group = [s, ...partners.map((p) => p.o)];
      const ler = lerOf(group.map((g) => g.crop));
      bestLer = Math.max(bestLer ?? 0, ler);
      const main = group
        .filter((g) => g.role !== 'intercrop')
        .sort((a, b) => crop(b.crop).a.value - crop(a.crop).a.value)[0];
      const n = new Set(group.map((g) => g.crop)).size;
      const mainShare = n === 2 ? 0.85 : 0.8;
      share = main && main.crop === s.crop ? mainShare : Math.max(0.15, (ler - mainShare) / Math.max(1, n - 1));
    }
    const market = markets.size === 0 ? 1 : markets.has(s.crop) ? 1.1 : 0.85;
    const local = ctx.marketFactor?.[s.crop] ?? 1;
    income += c.a.value * fits[i]!.yield * share * market * local;
  });
  // Semilla y siembra de la cobertura: una mezcla sembrada el mismo mes es una sola pasada.
  const coverCost = new Set(covers.map(({ s }) => `${s.year ?? 1}:${s.startMonth}`)).size * 3;
  let forageF = 0;
  seasons.forEach((s, i) => {
    if (s.role === 'fallow') return;
    const c = crop(s.crop);
    const grazable = s.role === 'cover' || s.role === 'forage' || (lens[i]! >= 12 && c.a.forage >= 0.6);
    if (grazable) {
      const inPlantation = seasons.some((o) => o !== s && (o.crop === 'coffee' || o.crop === 'plantain'));
      forageF += c.a.forage * (lens[i]! / 12) * fits[i]!.thermal * (inPlantation ? 0.4 : 1);
    } else forageF += c.a.forage * 0.35 * fits[i]!.yield;
  });
  forageF /= years;
  const livestock = markets.has('livestock');
  const incomeY = (income - coverCost * (livestock ? 0 : 1)) / years + (livestock ? 15 * forageF : 0);

  // ------------------------------------------------ perfil mensual (para "comparar 2")
  const monthly = Array.from({ length: 12 }, (_, m) => {
    let w = 0;
    let c = 0;
    for (let y = 0; y < years; y++) {
      w += etc[y * 12 + m]!;
      c += cover[y * 12 + m]!;
    }
    return { month: m + 1, waterUseMm: Math.round(w / years), soilCovered: c / years >= 0.4 };
  });
  const bareMonths = Array.from({ length: 12 }, (_, m) => m + 1).filter((m) => {
    let empty = 0;
    for (let y = 0; y < years; y++) if (!grid[y * 12 + m - 1]!.length) empty++;
    return empty * 2 >= years && empty > 0;
  });

  return {
    scores: {
      water: clamp100(100 * Math.exp(-irrigationMm / 500)),
      soilOrganicMatter: clamp100(som),
      nitrogen: clamp100(nitrogen),
      erosion: clamp100(erosion),
      pestBreak: clamp100(pestBreak),
      income: clamp100(100 * (1 - Math.exp(-Math.max(0, incomeY) / 70))),
      forage: clamp100(8 + 110 * forageF),
    },
    fits,
    irrigationMm,
    coverDeficitMm,
    coveredMonths: Math.round((cover.filter((c) => c >= 0.4).length / years) * 10) / 10,
    bareMonths,
    monthly,
    ler: bestLer,
    legumes: [...new Set(legumeIdx.map((i) => seasons[i]!.crop))],
  };
}
