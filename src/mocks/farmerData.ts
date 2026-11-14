/**
 * Mock de lo que hace el backend con los datos que cuenta el agricultor (tipo de tierra, encharcamiento, análisis
 * de suelo) y de qué datos le siguen faltando al análisis (`dataRequests`). Reglas simples y visibles.
 */
import type {
  AnalysisRequest,
  AnalysisResponse,
  Confidence,
  CropId,
  DataRequest,
  FieldInsights,
  RotationStrategy,
  SoilInfo,
} from '@/lib/api/contract';
import type { Archetype } from './climateTemplates';
import { NO_SOIL_TEST } from './strategies';

type Loc = 'es' | 'en';
const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const fmt = (n: number, l: Loc) => n.toLocaleString(l === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 });

const THIRSTY = new Set<CropId>(['rice', 'sugarcane', 'vegetables', 'potato']);
/** Cultivos que sufren con las raíces encharcadas. */
const WET_SENSITIVE = new Set<CropId>(['chickpea', 'groundnut', 'cowpea', 'sunflower', 'cotton', 'potato', 'millet', 'mungbean']);
const LEGUMES = new Set<CropId>(['soybean', 'beans', 'cowpea', 'groundnut', 'chickpea', 'mungbean', 'alfalfa', 'clover', 'vetch', 'forage-peanut']);
/** Zonas con meses muy húmedos: ahí el encharcamiento cambia la recomendación. */
const WET_ZONES = new Set<Archetype>(['monsoon', 'temperate', 'pampa']);

const TEXTURE: Record<Exclude<SoilInfo['texture'], 'unknown'>, { es: string; en: string }> = {
  sandy: { es: 'tierra arenosa', en: 'sandy soil' },
  loam: { es: 'tierra franca', en: 'loamy soil' },
  clay: { es: 'tierra arcillosa', en: 'clay soil' },
  silt: { es: 'tierra limosa', en: 'silty soil' },
};
const DRAINAGE: Record<NonNullable<SoilInfo['drainage']>, { es: string; en: string }> = {
  poor: { es: 'se encharca varios días', en: 'stays waterlogged for days' },
  moderate: { es: 'tarda un día en secar', en: 'takes about a day to drain' },
  good: { es: 'el agua se va rápido', en: 'water drains fast' },
};

/** "tierra arcillosa · se encharca varios días · pH 5,4 · materia orgánica 4,2 %" */
function describeSoil(soil: SoilInfo, l: Loc): string {
  const parts: string[] = [];
  if (soil.texture !== 'unknown') parts.push(TEXTURE[soil.texture][l]);
  if (soil.drainage) parts.push(DRAINAGE[soil.drainage][l]);
  if (soil.ph != null) parts.push(`pH ${fmt(soil.ph, l)}`);
  if (soil.organicMatterPct != null) parts.push(tr(l, `materia orgánica ${fmt(soil.organicMatterPct, l)} %`, `organic matter ${fmt(soil.organicMatterPct, l)}%`));
  return parts.join(' · ');
}

/** Con datos de la finca baja la incertidumbre: sube un nivel (a "alta" solo si ya no quedan vacíos). */
function bump(c: Confidence, noGaps: boolean): Confidence {
  if (c === 'low') return 'medium';
  if (c === 'medium' && noGaps) return 'high';
  return c;
}

function adjustStrategy(s: RotationStrategy, soil: SoilInfo, l: Loc): RotationStrategy {
  const crops = s.seasons.map((x) => x.crop);
  const has = (set: Set<CropId>) => crops.some((c) => set.has(c));
  const covers = s.seasons.some((x) => x.role === 'cover' || x.role === 'perennial' || x.role === 'forage');
  const scores = { ...s.scores };
  const benefits = [...s.benefits];
  const risks = [...s.risks];
  const review = [...s.needsLocalReview];
  const evidence = [...s.evidence];
  const tested = soil.ph != null || soil.organicMatterPct != null;
  const dataGaps = tested ? s.dataGaps.filter((g) => g !== NO_SOIL_TEST[l]) : s.dataGaps;

  const told = describeSoil(soil, l);
  if (told) {
    evidence.push({
      id: `${s.id}-farmer`,
      source: 'Dato local',
      statement: tr(l, `Lo que nos contaste: ${told}.`, `What you told us: ${told}.`),
    });
  }
  if (soil.texture === 'sandy' && has(THIRSTY)) {
    scores.water = clamp(scores.water - 10);
    risks.push(tr(l, 'Tu tierra arenosa guarda poca agua: esta rotación pedirá más riego.', 'Your sandy soil holds little water: this rotation will need more irrigation.'));
  }
  if (soil.texture === 'sandy' && covers) {
    benefits.push(tr(l, 'En tu tierra arenosa, el suelo cubierto guarda la humedad.', 'In your sandy soil, covered ground keeps moisture in.'));
  }
  const wet = soil.drainage === 'poor' || (soil.texture === 'clay' && soil.drainage !== 'good');
  if (wet && has(WET_SENSITIVE)) {
    scores.income = clamp(scores.income - 8);
    risks.push(
      tr(
        l,
        'Tu parcela se encharca: algunos cultivos de esta rotación sufren con las raíces en agua (siembra en surcos altos).',
        'Your plot gets waterlogged: some crops in this rotation suffer with wet roots (plant on raised beds).',
      ),
    );
  }
  if (soil.ph != null && soil.ph < 5.5 && has(LEGUMES)) {
    review.push(
      tr(
        l,
        `Tu suelo es ácido (pH ${fmt(soil.ph, l)}): pregunta por encalado antes de sembrar leguminosas.`,
        `Your soil is acidic (pH ${fmt(soil.ph, l)}): ask about liming before planting legumes.`,
      ),
    );
  }
  if (soil.organicMatterPct != null && soil.organicMatterPct < 2 && covers) {
    benefits.push(tr(l, 'Tu suelo tiene poca materia orgánica: la cobertura y el rastrojo la van subiendo.', 'Your soil is low in organic matter: cover crops and residue build it up.'));
  }
  const confidence = tested && soil.texture !== 'unknown' ? bump(s.confidence, dataGaps.length === 0) : s.confidence;
  return { ...s, scores, benefits, risks, needsLocalReview: review, evidence, dataGaps, confidence };
}

/** Lo que dice el agricultor de su parcela pesa más que el modelo del terreno. */
function drainageRisk(d: NonNullable<SoilInfo['drainage']>, l: Loc): NonNullable<FieldInsights['waterloggingRisk']> {
  if (d === 'poor') return { level: 'high', explanation: tr(l, 'Nos dijiste que el agua se queda varios días después de llover.', 'You told us water stays for days after rain.') };
  if (d === 'moderate') return { level: 'medium', explanation: tr(l, 'Nos dijiste que la parcela tarda un día en secar.', 'You told us the plot takes about a day to drain.') };
  return { level: 'low', explanation: tr(l, 'Nos dijiste que el agua se va rápido después de llover.', 'You told us water drains fast after rain.') };
}

function dataRequestsFor(req: AnalysisRequest, arch: Archetype, strategies: RotationStrategy[]): DataRequest[] {
  const { field, locale: l } = req;
  const soil = field.soil;
  const ids = (pick: (s: RotationStrategy) => boolean) => {
    const list = strategies.filter(pick).map((s) => s.id);
    return list.length ? list : undefined;
  };
  const out: DataRequest[] = [];
  if (!field.currentRotation.length) {
    out.push({
      need: 'current-rotation',
      impact: 'high',
      reason: tr(l, 'Comparamos con la rotación típica de tu zona. Con la tuya, comparamos con lo que haces de verdad.', 'We compare with the typical rotation for your area. With yours, we compare with what you really do.'),
      strategyIds: ids((s) => s.isCurrent),
    });
  }
  if (!soil || soil.texture === 'unknown') {
    out.push({
      need: 'soil-type',
      impact: 'high',
      reason:
        arch === 'sahel'
          ? tr(l, 'En tierra arenosa la poca lluvia se va rápido: cambia qué cultivos aguantan la sequía.', 'In sandy soil scarce rain drains away fast: it changes which crops can handle drought.')
          : arch === 'monsoon'
            ? tr(l, 'Una tierra arcillosa guarda el agua del monzón y una arenosa no: cambia cuánto riego necesitas.', 'Clay soil holds monsoon water and sandy soil does not: it changes how much irrigation you need.')
            : tr(l, 'El tipo de tierra cambia cuánta agua guarda y qué cultivos le van mejor.', 'Soil type changes how much water it holds and which crops suit it best.'),
    });
  }
  if (!soil?.drainage) {
    out.push({
      need: 'drainage',
      impact: WET_ZONES.has(arch) ? 'high' : 'medium',
      reason: WET_ZONES.has(arch)
        ? tr(l, 'Aquí hay meses muy húmedos: si tu parcela se encharca, algunas rotaciones no sirven.', 'There are very wet months here: if your plot gets waterlogged, some rotations will not work.')
        : tr(l, 'Si tu parcela se encharca, algunas raíces se pudren y cambia qué sembrar.', 'If your plot gets waterlogged, some roots rot and it changes what to plant.'),
      strategyIds: ids((s) => s.seasons.some((x) => WET_SENSITIVE.has(x.crop))),
    });
  }
  if (soil?.ph == null && soil?.organicMatterPct == null) {
    out.push({
      need: 'soil-test',
      impact: 'medium',
      reason: tr(l, 'Con el pH y la materia orgánica ajustamos el nitrógeno y la cal.', 'With pH and organic matter we fine-tune nitrogen and lime.'),
      strategyIds: ids((s) => s.dataGaps.includes(NO_SOIL_TEST[l])),
    });
  }
  return out;
}

/** Aplica lo que contó el agricultor y declara qué falta todavía (siempre al final, sobre la respuesta armada). */
export function applyFarmerData(res: AnalysisResponse, req: AnalysisRequest, arch: Archetype): AnalysisResponse {
  const soil = req.field.soil;
  const strategies = soil ? res.strategies.map((s) => adjustStrategy(s, soil, req.locale)) : res.strategies;
  const insights = soil?.drainage ? { ...res.insights, waterloggingRisk: drainageRisk(soil.drainage, req.locale) } : res.insights;
  return { ...res, insights, strategies, dataRequests: dataRequestsFor(req, arch, strategies) };
}
