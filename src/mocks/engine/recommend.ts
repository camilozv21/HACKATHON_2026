/**
 * Motor de recomendaciones (mock del backend, mismo contrato): arma las opciones de rotación para UNA finca.
 *
 *  1. Lo que haces hoy = la rotación que contó el agricultor (o la típica de su zona, avisando que la supusimos).
 *  2. Candidatos:
 *       a) mejorar lo de hoy: cobertura en el hueco sin cultivo, leguminosa intercalada, dejar el rastrojo;
 *       b) cultivos mixtos (asociaciones de la UI: milpa, maíz–guandul, café agroforestal…);
 *       c) rotaciones de la biblioteca que tienen sentido en la zona agroclimática.
 *  3. Cada candidato se ubica en el calendario de la finca y se evalúa con el mismo modelo (score.ts).
 *     Se descarta lo que no se da con el clima (rendimiento esperado < 45 %) o no cabe en la temporada.
 *  4. Se eligen 3 opciones distintas (una de cada tipo si se puede), con evidencia, riesgos y vacíos.
 * El orden final lo pone el teléfono con las prioridades de la persona (src/features/priorities/ranking.ts).
 */
import type { CropId, CropSeason, Evidence, FarmerPriorities, RotationStrategy } from '@/lib/api/contract';
import type { MonthlyClimate } from '@/features/rotations/mixed/climate';
import { matchGuild } from '@/features/rotations/mixed/guilds';
import { pairRelation } from '@/features/rotations/mixed/relations';
import { scoreStrategy, sowingsPerYear } from '@/features/priorities/ranking';
import { capitalize, crop, cropName, isLegume, monthFit } from './agronomy';
import { placeSystem } from './place';
import { seasonAbs, seasonLength, shift, toSeason, windows, type Windows } from './schedule';
import { evaluate, type EvalCtx, type Evaluation, type Irrigation, type SeasonFit } from './score';
import type { Site } from './site';
import { COVER_MIXES, INTERCROP_LEGUMES, SINGLE_COVERS, SYSTEMS, type L, type SystemFlags, type SystemTpl } from './systems';
import { incomeFactors, marketEvidence, marketGap, strategyMarket, type EngineMarket } from './market';

type Loc = 'es' | 'en';
const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);

const MONTHS: Record<Loc, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** [11,12,1,2] → "nov–feb"; [3,5,6] → "mar, may–jun". */
export function monthsLabel(months: number[], l: Loc): string {
  const names = MONTHS[l];
  const set = new Set(months);
  if (!set.size) return '';
  if (set.size === 12) return tr(l, 'todo el año', 'all year');
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;
    let end = m;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== m) end = (end % 12) + 1;
    out.push(m === end ? names[m - 1]! : `${names[m - 1]}–${names[end - 1]}`);
  }
  return out.join(', ');
}

const listJoin = (xs: string[], l: Loc) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${tr(l, 'y', 'and')} ${xs.at(-1)}`;

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha para "ver en el mapa": el mes más representativo del último año completo. */
const dateFor = (months: number[], day = 15) => `2025-${pad(months[Math.floor(months.length / 2)] ?? 7)}-${pad(day)}`;

// ---------------------------------------------------------------- frases compartidas

export const NO_SOIL_TEST: L = {
  es: 'No tenemos un análisis de suelo de tu finca; con él ajustaríamos la recomendación de nitrógeno y cal.',
  en: 'We don’t have a soil test from your farm; with one we could fine-tune nitrogen and lime advice.',
};
const NO_YIELDS: L = {
  es: 'No conocemos tus rendimientos ni precios locales; los ingresos son una estimación general.',
  en: 'We don’t know your yields or local prices; income is a general estimate.',
};
const LOCAL_SEEDS: L = {
  es: 'Variedades y fechas de siembra recomendadas para tu zona.',
  en: 'Recommended varieties and planting dates for your area.',
};

// ---------------------------------------------------------------- tipos de entrada

/** Encuesta del terreno (FieldSurvey en el contrato); se lee con cuidado porque todo es opcional. */
export type SurveyLike = {
  lastCrop?: CropId | null;
  fertilization?: 'none' | 'organic' | 'synthetic' | 'both' | null;
  residues?: 'leave' | 'burn' | 'graze' | 'remove' | null;
  purpose?: 'home' | 'sale' | 'both' | null;
};

export type RecommendInput = {
  site: Site;
  locale: Loc;
  current: CropSeason[];
  currentDuration: 12 | 24 | 36;
  /** true si la persona no nos dio su rotación y usamos la típica de la zona. */
  currentAssumed: boolean;
  currentFlags?: SystemFlags;
  constraints: FarmerPriorities['constraints'];
  survey?: SurveyLike | null;
  /** Máximo de opciones además de lo de hoy. */
  maxAlternatives?: number;
  /** Mercado de la zona (Colombia). Sin él, "ingresos" usa solo valores relativos genéricos. */
  market?: EngineMarket | null;
};

type Candidate = {
  id: string;
  kind: 'improve' | 'mixed' | 'rotation';
  name: string;
  durationMonths: 12 | 24 | 36;
  seasons: CropSeason[];
  flags: SystemFlags;
  ev: Evaluation;
  tpl?: SystemTpl;
  picks?: CropId[];
  /** Puntaje con todas las prioridades iguales (para elegir opciones variadas, no el orden final). */
  balanced: number;
  rationale: string;
  benefits: string[];
  risks: string[];
  review: string[];
  strong: boolean;
};

const EQUAL: FarmerPriorities = {
  waterSaving: 1,
  soilHealth: 1,
  income: 1,
  forage: 1,
  erosionControl: 1,
  laborEquipment: 1,
  constraints: { irrigation: 'none', equipment: [], markets: [] },
};

const RETENTION: Record<NonNullable<SurveyLike['residues']>, number> = { leave: 1, graze: 0.6, remove: 0.3, burn: 0.1 };

const durationOf = (years: number) => (Math.min(3, Math.max(1, years)) * 12) as 12 | 24 | 36;

function signature(seasons: CropSeason[], flags: SystemFlags): string {
  const s = seasons
    .filter((x) => x.role !== 'fallow')
    .map((x) => `${x.crop}:${x.role}:${x.year ?? 1}:${x.startMonth}-${x.endMonth}`)
    .sort()
    .join('|');
  return `${s}#${flags.mulch ? 'm' : ''}${flags.directSeededRice ? 'd' : ''}${flags.zai ? 'z' : ''}`;
}

const fill = (text: string, picks: CropId[], l: Loc) =>
  text.replace(/\{(\d)\}/g, (_, i: string) => {
    const id = picks[Number(i)];
    return id ? cropName(id, l) : '';
  });

/** Nombre corto de una rotación: "Maíz – soya, suelo desnudo nov–abr". */
function rotationName(seasons: CropSeason[], ev: Evaluation, l: Loc, flags: SystemFlags): string {
  const mains = [...seasons]
    .filter((s) => s.role === 'cash' || s.role === 'perennial' || s.role === 'forage')
    .filter((s) => crop(s.crop).t.food || s.role === 'forage')
    .sort((a, b) => seasonAbs(a) - seasonAbs(b));
  const crops = [...new Set(mains.map((s) => s.crop))];
  const label = (id: CropId) =>
    id === 'rice' && !flags.directSeededRice ? tr(l, 'arroz inundado', 'flooded rice') : cropName(id, l);
  if (!crops.length) return tr(l, 'Tu rotación', 'Your rotation');
  const annual = mains.filter((s) => seasonLength(s) < 12);
  if (crops.length === 1 && annual.length) return capitalize(tr(l, `${label(crops[0]!)} todos los años`, `${label(crops[0]!)} every year`));
  let name = capitalize(crops.map(label).join(' – '));
  const covered = seasons.some((s) => s.role === 'cover' || s.role === 'intercrop');
  if (!annual.length && !covered) name += tr(l, ', calles sin cobertura', ', bare inter-rows');
  else if (ev.bareMonths.length >= 3) name += tr(l, `, suelo desnudo ${monthsLabel(ev.bareMonths, l)}`, `, bare soil ${monthsLabel(ev.bareMonths, l)}`);
  if (flags.burn) name += tr(l, ', quemando la paja', ', burning straw');
  return name;
}

// ---------------------------------------------------------------- huecos sin cultivo

/** Tramos (posición absoluta, largo) sin ningún cultivo vivo en la línea de tiempo de la rotación. */
function bareRuns(seasons: CropSeason[], years: number): { abs: number; len: number }[] {
  const total = years * 12;
  const busy = new Array<boolean>(total).fill(false);
  for (const s of seasons) {
    if (s.role === 'fallow') continue;
    const a = seasonAbs(s);
    const len = seasonLength(s);
    if (len >= 12 && crop(s.crop).t.perennial) busy.fill(true);
    for (let k = 0; k < len; k++) busy[(a + k) % total] = true;
  }
  if (busy.every(Boolean)) return [];
  if (busy.every((b) => !b)) return [{ abs: 0, len: Math.min(11, total) }];
  const out: { abs: number; len: number }[] = [];
  for (let p = 0; p < total; p++) {
    if (busy[p] || !busy[(p - 1 + total) % total]) continue;
    let len = 0;
    while (len < total && !busy[(p + len) % total]) len++;
    out.push({ abs: p, len: Math.min(11, len) });
  }
  return out;
}

// ---------------------------------------------------------------- evidencia con números del sitio

type Ctx = {
  site: Site;
  l: Loc;
  cur: Evaluation;
  curSeasons: CropSeason[];
  rainSrc: 'NASA POWER' | 'GPM';
  soilSrc: 'NASA POWER' | 'SMAP';
};

function topRainMonths(site: Site): number[] {
  return [...site.months]
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((m) => m.month)
    .sort((a, b) => a - b);
}

function buildEvidence(c: Candidate | null, ctx: Ctx, isCurrent: boolean): Omit<Evidence, 'id'>[] {
  const { site, l, cur } = ctx;
  const ev = c?.ev ?? cur;
  const out: Omit<Evidence, 'id'>[] = [];
  const level = tr(l, { low: 'baja', medium: 'media', high: 'alta' }[site.erosivity], site.erosivity);

  // 1) Meses sin verde (MODIS NDVI) que esta opción cubre.
  const filled = cur.bareMonths.filter((m) => !ev.bareMonths.includes(m));
  if (isCurrent && cur.bareMonths.length >= 2) {
    out.push({
      source: 'MODIS',
      statement: tr(l, `MODIS NDVI: con esta rotación el campo queda sin verde en ${monthsLabel(cur.bareMonths, l)}.`, `MODIS NDVI: with this rotation the field has no green in ${monthsLabel(cur.bareMonths, l)}.`),
      rule: tr(l, 'Meses sin verde = suelo desnudo expuesto a la lluvia, el viento y el sol.', 'Months without green = bare soil exposed to rain, wind and sun.'),
      layerId: 'ndvi',
      date: dateFor(cur.bareMonths, 1),
      months: cur.bareMonths,
    });
  } else if (!isCurrent && filled.length >= 2) {
    out.push({
      source: 'MODIS',
      statement: tr(l, `MODIS NDVI: hoy el campo queda sin verde en ${monthsLabel(cur.bareMonths, l)}.`, `MODIS NDVI: today the field has no green in ${monthsLabel(cur.bareMonths, l)}.`),
      rule: tr(l, `Esta opción mantiene raíces vivas en ${monthsLabel(filled, l)}.`, `This option keeps living roots in ${monthsLabel(filled, l)}.`),
      layerId: 'ndvi',
      date: dateFor(filled, 1),
      months: filled,
    });
  }

  // 2) Humedad del suelo: lavado de nitrógeno (coberturas) o meses secos.
  const leachInGap = site.leachMonths.filter((m) => cur.bareMonths.includes(m));
  const hasCover = c?.seasons.some((s) => s.role === 'cover');
  if (hasCover && leachInGap.length) {
    out.push({
      source: ctx.soilSrc,
      statement: tr(l, `${ctx.soilSrc}: el suelo está muy húmedo en ${monthsLabel(leachInGap, l)}, sin cultivo que lo use.`, `${ctx.soilSrc}: the soil is very wet in ${monthsLabel(leachInGap, l)}, with no crop using it.`),
      rule: tr(l, 'El nitrógeno que sobra se lava con esa agua; una cobertura lo atrapa y lo devuelve después.', 'Leftover nitrogen washes out with that water; a cover crop catches it and returns it later.'),
      layerId: 'soil-moisture',
      date: dateFor(leachInGap, 1),
      months: leachInGap,
    });
  } else if (site.dryMonths.length) {
    out.push({
      source: ctx.soilSrc,
      statement: tr(l, `${ctx.soilSrc}: en ${monthsLabel(site.dryMonths, l)} llueve menos de la mitad de lo que el campo pierde por evaporación.`, `${ctx.soilSrc}: in ${monthsLabel(site.dryMonths, l)} it rains less than half of what the field loses to evaporation.`),
      rule: isCurrent
        ? tr(l, 'En esos meses los cultivos sufren sed si no hay riego.', 'In those months crops go thirsty without irrigation.')
        : tr(l, 'El calendario de esta opción evita sembrar en esos meses o usa cultivos que aguantan la sequía.', 'This option’s calendar avoids sowing in those months or uses drought-hardy crops.'),
      layerId: 'soil-moisture',
      date: dateFor(site.dryMonths, 1),
      months: site.dryMonths,
    });
  } else if (hasCover) {
    const months = c!.seasons.filter((s) => s.role === 'cover').flatMap((s) => Array.from({ length: seasonLength(s) }, (_, k) => shift(s.startMonth, k)));
    const uniq = [...new Set(months)].sort((a, b) => a - b);
    out.push({
      source: ctx.soilSrc,
      statement: tr(l, `${ctx.soilSrc}: hay humedad en el suelo en ${monthsLabel(uniq, l)} para que crezca una cobertura.`, `${ctx.soilSrc}: there is soil moisture in ${monthsLabel(uniq, l)} for a cover crop to grow.`),
      rule: tr(l, 'Hay que terminarla a tiempo para no quitarle agua al cultivo siguiente.', 'It must be terminated on time so it doesn’t take water from the next crop.'),
      layerId: 'soil-moisture',
      date: dateFor(uniq, 1),
      months: uniq,
    });
  }

  // 3) Lluvia erosiva y pendiente.
  const erosionMatters = site.erosivity !== 'low' || site.slopePct >= 8;
  if (erosionMatters && (isCurrent || ev.scores.erosion >= cur.scores.erosion + 8)) {
    const top = topRainMonths(site);
    out.push({
      source: ctx.rainSrc,
      statement: tr(l, `${ctx.rainSrc}: las lluvias más fuertes caen en ${monthsLabel(top, l)}; lluvia erosiva ${level} (índice de Fournier ${Math.round(site.mfi)}).`, `${ctx.rainSrc}: the heaviest rain falls in ${monthsLabel(top, l)}; ${level} erosive rain (Fournier index ${Math.round(site.mfi)}).`),
      rule: tr(l, 'Suelo desnudo + lluvia fuerte + pendiente = pérdida de suelo (lógica de la ecuación RUSLE).', 'Bare soil + heavy rain + slope = soil loss (logic of the RUSLE equation).'),
      layerId: 'rain',
      date: dateFor(top),
      months: top,
    });
    if (site.slopeKnown && site.slopePct >= 8) {
      out.push({
        source: 'SRTM',
        statement: tr(l, `SRTM: pendiente media cercana al ${Math.round(site.slopePct)} %.`, `SRTM: average slope close to ${Math.round(site.slopePct)}%.`),
        layerId: 'relief',
      });
    }
  }

  // 4) Heladas o calor, si esta opción los maneja.
  const coolCrops = (c?.seasons ?? ctx.curSeasons).filter((s) => crop(s.crop).t.frostOk && s.role !== 'fallow');
  if (site.frostMonths.length && coolCrops.length) {
    const names = [...new Set(coolCrops.map((s) => cropName(s.crop, l)))];
    out.push({
      source: 'NASA POWER',
      statement: tr(l, `NASA POWER: heladas en ${monthsLabel(site.frostMonths, l)}.`, `NASA POWER: frost in ${monthsLabel(site.frostMonths, l)}.`),
      rule: tr(l, `${capitalize(listJoin(names, l))} aguanta${names.length > 1 ? 'n' : ''} el frío del invierno.`, `${capitalize(listJoin(names, l))} handle${names.length > 1 ? '' : 's'} winter cold.`),
      months: site.frostMonths,
    });
  }
  const shadeOrMulch = c && (c.seasons.some((s) => s.crop === 'shade-trees') || c.flags.mulch || c.flags.zai);
  if (site.heatMonths.length && (isCurrent || shadeOrMulch)) {
    const tmax = Math.round(Math.max(...site.heatMonths.map((m) => site.months[m - 1]!.tmax)));
    out.push({
      source: 'MODIS',
      statement: tr(l, `NASA POWER y MODIS: calor fuerte en ${monthsLabel(site.heatMonths, l)} (máximas cerca de ${tmax} °C).`, `NASA POWER and MODIS: strong heat in ${monthsLabel(site.heatMonths, l)} (highs near ${tmax} °C).`),
      rule: shadeOrMulch
        ? tr(l, 'La sombra y el mantillo bajan la temperatura del suelo y de las hojas.', 'Shade and mulch lower soil and leaf temperature.')
        : undefined,
      layerId: 'lst-day',
      date: dateFor(site.heatMonths),
      months: site.heatMonths,
    });
  }

  // 5) Agua subterránea (GRACE-FO) cuando la opción ahorra riego.
  if (site.waterTrend?.direction === 'down' && (isCurrent || ev.irrigationMm < cur.irrigationMm - 50)) {
    out.push({
      source: 'GRACE',
      statement: tr(l, `GRACE-FO: el agua almacenada en la región baja ~${Math.abs(site.waterTrend.cmPerYear ?? 0)} cm por año.`, `GRACE-FO: water storage in the region is falling ~${Math.abs(site.waterTrend.cmPerYear ?? 0)} cm per year.`),
      rule: tr(l, 'Cultivos que piden menos riego frenan la caída.', 'Crops that need less irrigation slow the decline.'),
      layerId: 'groundwater',
    });
  }

  // 6) Asociación: uso equivalente de la tierra.
  if (c && ev.ler && ev.ler > 1.05) {
    const together = [...new Set(c.seasons.filter((s) => s.role === 'intercrop' || s.role === 'cash' || s.role === 'perennial').map((s) => cropName(s.crop, l)))];
    out.push({
      source: 'Modelo agronómico',
      statement: tr(l, `Sembrados juntos, ${listJoin(together, l)} rinden como ${ev.ler.toFixed(2)} ha sembradas por separado.`, `Grown together, ${listJoin(together, l)} yield like ${ev.ler.toFixed(2)} ha grown separately.`),
      rule: tr(l, 'Uso equivalente de la tierra (LER): las plantas usan luz, agua y nitrógeno de forma complementaria.', 'Land equivalent ratio (LER): the plants use light, water and nitrogen in complementary ways.'),
    });
  }

  // 7) Balance de agua del modelo (siempre: es la base del puntaje de agua).
  const enough = ev.irrigationMm < 30 && cur.irrigationMm < 30;
  out.push({
    source: 'Modelo agronómico',
    statement: enough
      ? tr(l, 'Balance de agua FAO-56: la lluvia de tu zona alcanza para esta opción; no necesita riego.', 'FAO-56 water balance: your area’s rain is enough for this option; no irrigation needed.')
      : isCurrent || !c
        ? tr(l, `Balance de agua FAO-56: esta rotación necesita ~${ev.irrigationMm} mm de riego al año para rendir al máximo.`, `FAO-56 water balance: this rotation needs ~${ev.irrigationMm} mm of irrigation a year for full yield.`)
        : tr(l, `Balance de agua FAO-56: ~${ev.irrigationMm} mm de riego al año para rendir al máximo (lo de hoy: ~${cur.irrigationMm} mm).`, `FAO-56 water balance: ~${ev.irrigationMm} mm of irrigation a year for full yield (today: ~${cur.irrigationMm} mm).`),
    rule: tr(l, 'Lluvia efectiva frente a lo que pierde cada cultivo mes a mes (ET0 × coeficiente del cultivo).', 'Effective rain against what each crop loses month by month (ET0 × crop coefficient).'),
  });

  return out.slice(0, 5);
}

// ---------------------------------------------------------------- beneficios, riesgos y vacíos generados

function stressText(f: SeasonFit, l: Loc): string {
  const name = capitalize(cropName(f.season.crop, l));
  const when = monthsLabel(f.months, l);
  switch (f.stress) {
    case 'frost':
      return tr(l, `${name} sufre con las heladas de ${when}.`, `${name} suffers from frost in ${when}.`);
    case 'cold':
      return tr(l, `${name} crece lento con el frío de ${when}.`, `${name} grows slowly in the cold of ${when}.`);
    case 'heat':
      return tr(l, `${name} sufre con el calor de ${when}.`, `${name} suffers from the heat in ${when}.`);
    case 'wet':
      return tr(l, `${name} puede tener hongos con tanta lluvia en ${when}.`, `${name} may get fungal disease with so much rain in ${when}.`);
    default:
      return tr(l, `${name} pasa sed en ${when}: la lluvia cubre solo el ${Math.round(f.water * 100)} % de lo que pide.`, `${name} goes thirsty in ${when}: rain covers only ${Math.round(f.water * 100)}% of its needs.`);
  }
}

function generatedBenefits(c: Candidate, cur: Evaluation, l: Loc): string[] {
  const ev = c.ev;
  const out: string[] = [];
  const d = (k: keyof Evaluation['scores']) => ev.scores[k] - cur.scores[k];
  if (d('erosion') >= 8 && ev.coveredMonths > cur.coveredMonths)
    out.push(tr(l, `Suelo cubierto ${Math.round(ev.coveredMonths)} de 12 meses (hoy ${Math.round(cur.coveredMonths)}): frena la erosión.`, `Soil covered ${Math.round(ev.coveredMonths)} of 12 months (today ${Math.round(cur.coveredMonths)}): stops erosion.`));
  if (d('nitrogen') >= 8 && ev.legumes.length) {
    const names = ev.legumes.map((x) => cropName(x, l));
    out.push(tr(l, `${capitalize(listJoin(names, l))} fija${names.length > 1 ? 'n' : ''} nitrógeno del aire: menos fertilizante.`, `${capitalize(listJoin(names, l))} fix${names.length > 1 ? '' : 'es'} nitrogen from the air: less fertilizer.`));
  }
  if (cur.irrigationMm - ev.irrigationMm >= 50)
    out.push(tr(l, `Pide ~${cur.irrigationMm - ev.irrigationMm} mm menos de riego al año.`, `Needs ~${cur.irrigationMm - ev.irrigationMm} mm less irrigation a year.`));
  if (d('soilOrganicMatter') >= 8) out.push(tr(l, 'Más raíces y rastrojo: sube la materia orgánica del suelo.', 'More roots and residue: soil organic matter goes up.'));
  if (d('pestBreak') >= 10) out.push(tr(l, 'Cambiar de familia de cultivo corta el ciclo de plagas y enfermedades.', 'Switching crop families breaks pest and disease cycles.'));
  if (d('forage') >= 15) out.push(tr(l, 'Da forraje para los animales.', 'Provides forage for animals.'));
  if (d('income') >= 5 && ev.ler && ev.ler > 1.05)
    out.push(tr(l, 'Más de una cosecha del mismo terreno: más ingreso estimado.', 'More than one harvest from the same land: higher estimated income.'));
  return out;
}

function generatedRisks(c: Candidate | null, ev: Evaluation, cur: Evaluation, input: RecommendInput, inferredIrrigation: boolean, l: Loc): string[] {
  const out: string[] = [];
  const seen = new Set<CropId>();
  for (const f of [...ev.fits].sort((a, b) => a.yield - b.yield)) {
    if (f.season.role === 'fallow' || f.season.role === 'cover' || seen.has(f.season.crop)) continue;
    if (f.yield < 0.75 && f.stress) {
      out.push(stressText(f, l));
      seen.add(f.season.crop);
    }
  }
  const { irrigation } = input.constraints;
  const thirsty = ev.fits.some((f) => f.season.role !== 'cover' && f.season.role !== 'fallow' && f.water < 0.75);
  if (irrigation === 'none' && ev.irrigationMm > 150 && (thirsty || inferredIrrigation)) {
    out.push(
      inferredIrrigation
        ? tr(l, `Necesita riego (~${ev.irrigationMm} mm al año). Marcaste que no tienes, pero lo de hoy ya lo necesita: revisa ese dato.`, `Needs irrigation (~${ev.irrigationMm} mm a year). You said you have none, but today’s rotation already needs it: check that answer.`)
        : tr(l, `Para rendir al máximo necesitaría ~${ev.irrigationMm} mm de riego al año y nos dijiste que no tienes.`, `For full yield it would need ~${ev.irrigationMm} mm of irrigation a year and you told us you have none.`),
    );
  }
  if (c && ev.coverDeficitMm > 40)
    out.push(tr(l, 'En años secos la cobertura puede usar agua del cultivo siguiente: termínala a tiempo.', 'In dry years the cover can use water from the next crop: terminate it on time.'));
  if (c && cur.scores.income - ev.scores.income >= 8)
    out.push(tr(l, 'El ingreso estimado es menor que el de lo que haces hoy.', 'Estimated income is lower than what you do today.'));
  const crops = new Set((c?.seasons ?? input.current).map((s) => s.crop));
  const { markets, equipment } = input.constraints;
  if (c && markets.length) {
    const sells = markets.some((m) => crops.has(m as CropId) || (m === 'livestock' && ev.scores.forage >= 40));
    if (!sells) out.push(tr(l, 'No incluye los cultivos que hoy vendes cerca: busca comprador antes de sembrar.', 'It does not include the crops you sell nearby today: find a buyer before planting.'));
  }
  const seasons = c?.seasons ?? input.current;
  const noPower = equipment.length > 0 && !equipment.includes('tractor') && !equipment.includes('animal');
  if (noPower && sowingsPerYear(seasons, c?.durationMonths ?? input.currentDuration) > 1.5)
    out.push(tr(l, 'Son muchas siembras al año para hacerlas sin tractor ni animales.', 'That is a lot of planting per year without a tractor or animals.'));
  const last = input.survey?.lastCrop;
  if (c && last && last !== 'fallow') {
    const first = [...seasons].filter((s) => s.role === 'cash').sort((a, b) => seasonAbs(a) - seasonAbs(b))[0];
    if (first && crop(first.crop).t.family === crop(last).t.family && crop(last).t.family !== 'mixed')
      out.push(tr(l, `Lo último que sembraste fue ${cropName(last, l)}: empieza por otro cultivo de familia distinta para no mantener sus plagas.`, `Your last crop was ${cropName(last, l)}: start with a crop from another family so its pests don’t carry over.`));
  }
  if (!c && (input.currentFlags?.burn || input.survey?.residues === 'burn'))
    out.push(tr(l, 'Quemar el rastrojo daña el suelo y el aire, y pierde materia orgánica.', 'Burning residue harms soil and air, and loses organic matter.'));
  if (input.survey?.fertilization === 'none' && ev.legumes.length === 0 && seasons.some((s) => crop(s.crop).t.feeder === 'heavy'))
    out.push(tr(l, 'Nos dijiste que no fertilizas y aquí no hay leguminosas: el suelo se va a quedar sin nitrógeno.', 'You told us you don’t fertilize and there are no legumes here: the soil will run short of nitrogen.'));
  return out;
}

function confidenceOf(ev: Evaluation, site: Site, strong: boolean): RotationStrategy['confidence'] {
  const mains = ev.fits.filter((f) => f.season.role !== 'fallow' && f.season.role !== 'cover');
  const worst = mains.length ? Math.min(...mains.map((f) => f.yield)) : 1;
  if (worst < 0.6) return 'low';
  if (site.source === 'power' && worst >= 0.85 && strong) return 'high';
  return site.source === 'template' && worst < 0.75 ? 'low' : 'medium';
}

// ---------------------------------------------------------------- candidatos

function improveVariants(input: RecommendInput, ctxBase: Omit<EvalCtx, 'flags'>, cur: Evaluation, l: Loc): Candidate[] {
  const out: Candidate[] = [];
  const years = input.currentDuration / 12;
  const base = input.current;
  const baseFlags = input.currentFlags ?? {};
  const make = (id: string, seasons: CropSeason[], flags: SystemFlags, name: string, rationale: string, review: string[], risks: string[] = []): Candidate => {
    const ev = evaluate(seasons, input.currentDuration, { ...ctxBase, flags });
    return { id, kind: 'improve', name, durationMonths: input.currentDuration, seasons, flags, ev, balanced: 0, rationale, benefits: [], risks, review, strong: true };
  };
  const currentName = rotationName(base, cur, l, {}).replace(/,.*$/, '');

  // a) Cobertura en los huecos sin cultivo (≥ 2 meses).
  const gaps = bareRuns(base, years).filter((g) => g.len >= 2);
  if (gaps.length) {
    const options: { id: string; crops: CropId[] }[] = [...COVER_MIXES, ...SINGLE_COVERS.map((c) => ({ id: c, crops: [c] }))];
    for (const opt of options) {
      const added: CropSeason[] = [];
      let ok = true;
      for (const g of gaps) {
        for (const c of opt.crops) {
          const s = toSeason(c, 'cover', g.abs, g.len, years);
          const ev = evaluate([s], 12, { ...ctxBase, flags: {} }).fits[0]!;
          if (ev.thermal < 0.5) ok = false;
          added.push(s);
        }
      }
      if (!ok) continue;
      const names = listJoin(opt.crops.map((c) => cropName(c, l)), l);
      const gapMonths = [...new Set(gaps.flatMap((g) => Array.from({ length: g.len }, (_, k) => (((g.abs + k) % 12) + 1))))];
      out.push(
        make(
          `current-cover-${opt.id}`,
          [...base, ...added],
          { ...baseFlags, burn: false },
          tr(l, `${currentName} con ${names} de cobertura`, `${currentName} with ${names} cover crop`),
          tr(
            l,
            `Mantienes tus cultivos y siembras ${names} en el hueco de ${monthsLabel(gapMonths, l)}: raíces vivas que protegen el suelo y atrapan nitrógeno.`,
            `You keep your crops and sow ${names} in the ${monthsLabel(gapMonths, l)} gap: living roots that protect the soil and catch nitrogen.`,
          ),
          [
            tr(l, 'Fecha y forma de terminar la cobertura antes de sembrar.', 'Date and method to terminate the cover before planting.'),
            tr(l, 'Sin sembradora de siembra directa: la cobertura se puede sembrar al voleo antes de la cosecha.', 'Without a no-till drill: the cover can be broadcast before harvest.'),
          ],
          [tr(l, 'Costo de semilla y una labor más después de la cosecha.', 'Seed cost and one more field operation after harvest.')],
        ),
      );
    }
  }

  // b) Leguminosa intercalada con el cultivo principal anual que no es leguminosa.
  const mains = base.filter((s) => s.role === 'cash' && seasonLength(s) < 12 && !isLegume(s.crop));
  if (mains.length) {
    const target = mains[0]!;
    for (const leg of INTERCROP_LEGUMES) {
      const rel = pairRelation(target.crop, leg);
      if (rel.value <= 0 || base.some((s) => s.crop === leg)) continue;
      const guild = matchGuild([target.crop, leg]);
      const week = guild?.members.find((m) => m.crop === leg)?.sowWeek ?? 0;
      const added = mains
        .filter((m) => m.crop === target.crop)
        .map((m) => toSeason(leg, 'intercrop', seasonAbs(m) + Math.round(week / 4.3), Math.max(2, Math.min(seasonLength(m), Math.round(crop(leg).t.cycleDays / 30))), years));
      out.push(
        make(
          `current-intercrop-${leg}`,
          [...base, ...added],
          baseFlags,
          tr(l, `${capitalize(cropName(target.crop, l))} con ${cropName(leg, l)} intercalado`, `${capitalize(cropName(target.crop, l))} with intercropped ${cropName(leg, l)}`),
          tr(
            l,
            `Siembras ${cropName(leg, l)} entre los surcos de ${cropName(target.crop, l)}: la leguminosa deja nitrógeno, cubre el suelo y da una cosecha más.`,
            `You sow ${cropName(leg, l)} between the ${cropName(target.crop, l)} rows: the legume leaves nitrogen, covers the soil and gives an extra harvest.`,
          ),
          [tr(l, 'Arreglo de surcos y densidad para que no compitan por luz.', 'Row arrangement and density so they don’t compete for light.')],
          [tr(l, 'Más trabajo en la siembra y en la cosecha.', 'More work at planting and harvest.')],
        ),
      );
      out.at(-1)!.kind = 'mixed';
    }
  }

  // c) Cobertura viva bajo un perenne sin cobertura (calles del café, del plátano o de la caña).
  const perennial = base.find((s) => PERENNIAL_CASH.has(s.crop));
  if (perennial && !base.some((s) => s.role === 'cover' || s.role === 'intercrop')) {
    // Una sola cobertura: la que mejor se da con el clima (el maní forrajero es la de referencia en el trópico).
    const fitOf = (id: CropId) => Array.from({ length: 12 }, (_, i) => monthFit(id, i + 1, ctxBase.clim, ctxBase.irrigation)).reduce((a, b) => a + b, 0) / 12;
    const ranked = (['forage-peanut', 'clover', 'vetch'] as CropId[]).map((id) => ({ id, fit: fitOf(id) })).sort((a, b) => b.fit - a.fit);
    const best = ranked.find((r) => r.fit >= ranked[0]!.fit - 0.05 && r.id === 'forage-peanut') ?? ranked[0]!;
    for (const cov of best.fit >= 0.5 ? [best.id] : []) {
      const added = Array.from({ length: years }, (_, y) => ({ crop: cov, role: 'cover' as const, year: y + 1, startMonth: 1, endMonth: 12 }));
      out.push(
        make(
          `current-cover-${cov}`,
          [...base, ...added],
          baseFlags,
          tr(l, `${capitalize(cropName(perennial.crop, l))} con ${cropName(cov, l)} en las calles`, `${capitalize(cropName(perennial.crop, l))} with ${cropName(cov, l)} between rows`),
          tr(
            l,
            `Mantienes tu ${cropName(perennial.crop, l)} y siembras ${cropName(cov, l)} entre los surcos: cubre el suelo todo el año, frena la maleza y, como es leguminosa, deja nitrógeno.`,
            `You keep your ${cropName(perennial.crop, l)} and sow ${cropName(cov, l)} between rows: it covers the soil all year, holds back weeds and, being a legume, leaves nitrogen.`,
          ),
          [tr(l, 'Cómo establecer la cobertura sin competir con el cultivo los primeros meses.', 'How to establish the cover without competing with the crop in the first months.')],
          [tr(l, 'Los primeros meses hay que desyerbar a mano hasta que la cobertura cierre.', 'In the first months you must hand-weed until the cover closes in.')],
        ),
      );
    }
  }

  // d) Dejar el rastrojo como mantillo (si hoy se quema o se retira, o en zonas secas donde más ayuda).
  const dryZone = ['semi-arid', 'arid', 'savanna', 'mediterranean'].includes(input.site.zone);
  if (!perennial && (baseFlags.burn || ctxBase.retention < 0.8 || (dryZone && ctxBase.retention < 1))) {
    out.push(
      make(
        'current-mulch',
        base,
        { ...baseFlags, burn: false, mulch: true },
        tr(l, `${currentName} dejando el rastrojo como mantillo`, `${currentName} keeping residue as mulch`),
        tr(l, 'Los mismos cultivos, pero el rastrojo se queda sobre el suelo: lo protege, guarda humedad y alimenta la vida del suelo.', 'Same crops, but residue stays on the ground: it protects the soil, keeps moisture and feeds soil life.'),
        [tr(l, 'Cómo sembrar sobre el rastrojo (siembra directa o labranza mínima).', 'How to sow into residue (no-till or minimum tillage).')],
        [tr(l, 'Con mucho rastrojo la siembra es más difícil sin sembradora adecuada.', 'Heavy residue makes sowing harder without a suitable planter.')],
      ),
    );
  }
  return out;
}

function libraryCandidates(input: RecommendInput, ctxBase: Omit<EvalCtx, 'flags'>, w: Windows, l: Loc): Candidate[] {
  const out: Candidate[] = [];
  const currentCrops = new Set(input.current.map((s) => s.crop));
  const livestock = hasLivestock(input);
  for (const sys of SYSTEMS) {
    if (!sys.zones.includes(input.site.zone)) continue;
    if (sys.ifCurrentHas && !sys.ifCurrentHas.some((c) => currentCrops.has(c))) continue;
    if (sys.needsLivestock && !livestock) continue;
    const placed = placeSystem(sys, input.site, w, ctxBase.clim, ctxBase.irrigation);
    if (!placed.fits) continue;
    const flags = sys.flags ?? {};
    const durationMonths = durationOf(sys.years);
    const ev = evaluate(placed.seasons, durationMonths, { ...ctxBase, flags });
    out.push({
      id: sys.id,
      kind: sys.kind === 'mixed' ? 'mixed' : 'rotation',
      name: capitalize(fill(sys.name[l], placed.picks, l)),
      durationMonths,
      seasons: placed.seasons,
      flags,
      ev,
      tpl: sys,
      picks: placed.picks,
      balanced: 0,
      rationale: fill(sys.rationale[l], placed.picks, l),
      benefits: sys.benefits.map((b) => fill(b[l], placed.picks, l)),
      risks: sys.risks.map((b) => fill(b[l], placed.picks, l)),
      review: sys.review.map((b) => fill(b[l], placed.picks, l)),
      strong: Boolean(sys.strong),
    });
  }
  return out;
}

/** ¿Se da con el clima? Todo cultivo que se cosecha rinde ≥ 45 % del máximo y las coberturas crecen (frío y agua). */
function viable(c: Candidate): boolean {
  return c.ev.fits.every((f) => {
    if (f.season.role === 'fallow') return true;
    if (f.season.role === 'cover') return f.thermal >= 0.45 && f.water >= 0.4;
    return f.yield >= 0.45 && f.thermal >= 0.55;
  });
}

/** ¿Hay animales en la finca? (mercado de ganado, tracción animal o forraje en lo de hoy). */
function hasLivestock(input: RecommendInput): boolean {
  return (
    input.constraints.markets.includes('livestock') ||
    input.constraints.equipment.includes('animal') ||
    input.current.some((s) => s.role === 'forage' || s.crop === 'pasture' || s.crop === 'alfalfa')
  );
}

const PERENNIAL_CASH = new Set<CropId>(['coffee', 'plantain', 'sugarcane']);

// ---------------------------------------------------------------- principal

export type Recommendation = {
  strategies: RotationStrategy[];
  current: Evaluation;
  inferredIrrigation: boolean;
  /** Para depurar y para las pruebas: todos los candidatos evaluados y si se dan con el clima. */
  considered: { id: string; kind: Candidate['kind']; balanced: number; viable: boolean; worst: string }[];
};

export function recommend(input: RecommendInput): Recommendation {
  const { site, locale: l } = input;
  const clim: MonthlyClimate = {
    tMean: site.months.map((m) => m.t),
    precip: site.months.map((m) => m.p),
    frost: site.months.map((m) => m.frost),
  };
  const retention = input.survey?.residues ? RETENTION[input.survey.residues] : 0.8;
  const currentFlags = input.currentFlags ?? {};

  // Si lo de hoy solo se da con riego y la persona marcó "sin riego", suponemos que riega lo de hoy (y lo decimos).
  let irrigation: Irrigation = input.constraints.irrigation;
  let inferredIrrigation = false;
  if (irrigation === 'none') {
    const probe = evaluate(input.current, input.currentDuration, { site, clim, irrigation, retention, markets: input.constraints.markets, flags: currentFlags });
    if (probe.fits.some((f) => (f.season.role === 'cash' || f.season.role === 'perennial') && f.water < 0.4)) {
      irrigation = 'full';
      inferredIrrigation = true;
    }
  }
  const marketFactor = incomeFactors(input.market, input.survey?.purpose);
  const ctxBase: Omit<EvalCtx, 'flags'> = { site, clim, irrigation, retention, markets: input.constraints.markets, marketFactor };
  const cur = evaluate(input.current, input.currentDuration, { ...ctxBase, flags: currentFlags });
  const w = windows(site);

  const curSig = signature(input.current, currentFlags);
  // Un perenne (café, plátano, caña) es una inversión de años: las opciones que lo quitan van al final y lo dicen.
  const perennial = input.current.find((s) => PERENNIAL_CASH.has(s.crop))?.crop;
  const pool = [...improveVariants(input, ctxBase, cur, l), ...libraryCandidates(input, ctxBase, w, l)]
    .filter((c) => signature(c.seasons, c.flags) !== curSig)
    .map((c) => {
      const balanced = scoreStrategy({ scores: c.ev.scores, seasons: c.seasons, durationMonths: c.durationMonths }, EQUAL).total;
      const drops = perennial && !c.seasons.some((s) => s.crop === perennial);
      const targeted = c.tpl?.ifCurrentHas ? 5 : 0;
      return {
        ...c,
        balanced: balanced + targeted - (drops ? 15 : 0),
        risks: drops
          ? [tr(l, `Cambiar el ${cropName(perennial, l)} por otros cultivos es una decisión de varios años: compárala con calma.`, `Replacing ${cropName(perennial, l)} with other crops is a multi-year decision: weigh it carefully.`), ...c.risks]
          : c.risks,
      };
    });
  const good = pool.filter(viable).sort((a, b) => b.balanced - a.balanced);

  // Una opción de cada tipo (mejorar lo de hoy, cultivos mixtos, otra rotación) y luego las mejores que queden.
  const max = input.maxAlternatives ?? 3;
  const chosen: Candidate[] = [];
  const cropSet = (c: Candidate) => [...new Set(c.seasons.filter((s) => s.role !== 'fallow').map((s) => s.crop))].sort().join(',');
  // Variantes de la misma idea (otra cobertura en el mismo hueco) no cuentan como opciones distintas.
  const family = (c: Candidate) => (c.id.startsWith('current-cover-') ? 'cover' : c.id.startsWith('current-intercrop-') ? 'intercrop' : c.id);
  const take = (c: Candidate | undefined, allowSameFamily = false) => {
    if (!c || chosen.length >= max) return;
    if (chosen.some((x) => x.id === c.id || cropSet(x) === cropSet(c))) return;
    if (!allowSameFamily && chosen.some((x) => family(x) === family(c))) return;
    chosen.push(c);
  };
  take(good.find((c) => c.kind === 'improve'));
  take(good.find((c) => c.kind === 'mixed' && !chosen.some((x) => cropSet(x) === cropSet(c))));
  take(good.find((c) => c.kind === 'rotation' && !chosen.some((x) => cropSet(x) === cropSet(c))));
  for (const c of good) take(c);
  if (chosen.length < 2) for (const c of good) take(c, true);
  // El contrato pide al menos 3 estrategias: si el clima deja muy pocas, se muestran las menos malas, avisando.
  const weak = pool.filter((c) => !viable(c)).sort((a, b) => b.balanced - a.balanced);
  for (const c of weak) {
    if (chosen.length >= 2) break;
    take({ ...c, risks: [tr(l, 'Con el clima de tu zona esta opción es difícil: tómala como idea para conversar con un técnico.', 'With your area’s climate this option is hard: take it as an idea to discuss with an advisor.'), ...c.risks] });
  }

  const rainSrc = site.source === 'power' ? 'NASA POWER' : 'GPM';
  const soilSrc = site.source === 'power' ? 'NASA POWER' : 'SMAP';
  const ctx: Ctx = { site, l, cur, curSeasons: input.current, rainSrc, soilSrc };

  const commonGaps = (ev: Evaluation): string[] => {
    const gaps = [NO_SOIL_TEST[l]];
    if (!site.slopeKnown)
      gaps.push(tr(l, `No medimos la pendiente de tu finca: supusimos un ${site.slopePct} % típico de la zona. En ladera, la erosión pesa más.`, `We didn’t measure your farm’s slope: we assumed a typical ${site.slopePct}% for the area. On hillsides, erosion matters more.`));
    if (site.zone === 'semi-arid' || site.zone === 'arid' || site.zone === 'savanna')
      gaps.push(tr(l, 'Usamos promedios del mes: no muestran las semanas secas dentro de la temporada de lluvias, que en tu zona son comunes.', 'We use monthly averages: they don’t show dry spells within the rainy season, which are common in your area.'));
    if (site.source === 'template')
      gaps.push(tr(l, 'No pudimos leer el clima de NASA POWER: usamos valores típicos de la zona.', 'We couldn’t read NASA POWER climate: we used typical values for the area.'));
    else gaps.push(tr(l, 'El clima de NASA POWER es un promedio de ~50 km: tu finca puede ser más fresca o más lluviosa.', 'NASA POWER climate is a ~50 km average: your farm may be cooler or wetter.'));
    if (ev.scores.income > 0) gaps.push(input.market ? marketGap(input.market, l) : NO_YIELDS[l]);
    return gaps;
  };

  const build = (c: Candidate | null): RotationStrategy => {
    const ev = c?.ev ?? cur;
    const id = c?.id ?? 'current';
    const seasons = c?.seasons ?? input.current;
    const market = strategyMarket(seasons, input.market, marketFactor, l, !c);
    const evidence = [...buildEvidence(c, ctx, !c), ...marketEvidence(market, l)].map((e, i): Evidence => ({ id: `${id}-ev${i + 1}`, ...e }));
    const risks = [
      ...new Set(c ? [...generatedRisks(c, ev, cur, input, inferredIrrigation, l), ...c.risks] : generatedRisks(null, ev, cur, input, inferredIrrigation, l)),
    ];
    const { markets } = input.constraints;
    const crops = new Set(seasons.map((s) => s.crop));
    const sells = markets.some((m) => crops.has(m as CropId) || (m === 'livestock' && ev.scores.forage >= 40));
    const marketBenefit = sells ? [tr(l, 'Incluye cultivos que nos dijiste que puedes vender cerca.', 'Includes crops you told us you can sell nearby.')] : [];
    // El riesgo de mercado más fuerte también va en la lista general (el resto, en el bloque "Mercado").
    if (market?.risks[0] && !risks.includes(market.risks[0])) risks.splice(Math.min(2, risks.length), 0, market.risks[0]);
    if (!c && !risks.length) risks.push(tr(l, 'Sin cambios, el suelo sigue igual: no mejora la materia orgánica ni la resistencia a la sequía.', 'Without changes the soil stays as it is: organic matter and drought resilience don’t improve.'));
    const gaps = commonGaps(ev);
    if (!c && input.currentAssumed)
      gaps.unshift(tr(l, 'Supusimos la rotación más común de tu zona porque no nos contaste la tuya: cámbiala en “Tu rotación actual”.', 'We assumed the most common rotation in your area because you didn’t tell us yours: change it in “Your current rotation”.'));
    const review = c ? [...c.review, LOCAL_SEEDS[l]] : [tr(l, 'Plan de fertilización y manejo actual.', 'Current fertilization and management plan.')];
    if (c && c.kind !== 'improve') review.push(tr(l, 'Fechas de siembra: las calculamos con el clima promedio; ajústalas con tu experiencia.', 'Planting dates: we computed them from average climate; adjust them with your experience.'));
    return {
      id,
      name: c?.name ?? rotationName(seasons, ev, l, currentFlags),
      isCurrent: !c,
      durationMonths: c?.durationMonths ?? input.currentDuration,
      seasons,
      scores: ev.scores,
      rationale: c
        ? c.rationale
        : input.currentAssumed
          ? tr(l, 'Es lo más común en tu zona (no nos contaste tu rotación). Así se comporta con el clima de tu finca.', 'This is the most common rotation in your area (you didn’t tell us yours). This is how it does with your farm’s climate.')
          : tr(l, 'Es lo que haces hoy, medido con la misma cuenta que las demás opciones para que puedas compararlas.', 'This is what you do today, measured with the same math as the other options so you can compare them.'),
      evidence,
      benefits: c
        ? [...marketBenefit, ...generatedBenefits(c, cur, l), ...c.benefits].slice(0, 4)
        : [...marketBenefit, tr(l, 'Manejo conocido: ya tienes la experiencia, las semillas y el mercado.', 'Familiar management: you already have the experience, seed and market.')],
      risks: risks.slice(0, 4),
      dataGaps: gaps,
      needsLocalReview: review,
      confidence: confidenceOf(ev, site, c ? c.strong : true),
      monthly: ev.monthly,
      ...(market ? { market } : {}),
    };
  };

  const considered = pool.map((c) => {
    const worst = [...c.ev.fits].filter((f) => f.season.role !== 'fallow').sort((a, b) => a.yield - b.yield)[0];
    return {
      id: c.id,
      kind: c.kind,
      balanced: c.balanced,
      viable: viable(c),
      worst: worst ? `${worst.season.crop}/${worst.season.role} t${worst.thermal.toFixed(2)} w${worst.water.toFixed(2)} y${worst.yield.toFixed(2)}` : '',
    };
  });
  return { strategies: [build(null), ...chosen.map(build)], current: cur, inferredIrrigation, considered };
}
