/**
 * Mock de GET /region: resumen de sensores NASA para una región (drawer).
 * Temperatura y lluvia reales de NASA POWER (diario + climatología) cuando están disponibles;
 * el resto se simula con las plantillas de la región y se marca `simulated: true`.
 */
import { getDemo } from '@/features/field/demoFarms';
import meta from '@/features/layers/gibs-meta.json';
import type { RegionSensorCard, RegionSummary } from '@/lib/api/contract';
import { archetypeFor, DEMO_ARCHETYPE, seeded, TEMPLATES, type Archetype } from './climateTemplates';

type Loc = 'es' | 'en';
const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);

export type PowerRecent = {
  days: { date: string; precip: number | null; tmax: number | null; tmin: number | null }[];
  /** Climatología mensual (mm/día y °C), índice 0 = enero. */
  climPrecipMmDay: number[];
  climTmax: number[];
};

const WATER_TREND: Record<Archetype, number> = {
  'tropical-highland': 0.1,
  temperate: -0.2,
  monsoon: -1.6,
  sahel: 0.4,
  pampa: -0.5,
};
const SLOPE: Record<Archetype, number> = { 'tropical-highland': 28, temperate: 3, monsoon: 1, sahel: 2, pampa: 1.5 };

const layerDate = (gibsId: string, fallback: string) =>
  (meta.layers as Record<string, { defaultTime: string | null }>)[gibsId]?.defaultTime ?? fallback;

const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function buildMockRegion(
  q: {
    lat: number;
    lon: number;
    demoId?: string;
    name?: string | null;
    locale: Loc;
    now?: Date;
    /** Máquina del tiempo: el mes elegido (los datos de `power` son de ese periodo). */
    period?: { start: string; end: string; label: string; partial: boolean };
  },
  power: PowerRecent | null,
): RegionSummary {
  const { lat, lon, locale: l } = q;
  const P = q.period;
  const now = q.now ?? (P ? new Date(`${P.end}T12:00:00Z`) : new Date());
  const pDays = P ? Math.round((Date.parse(P.end) - Date.parse(P.start)) / 86_400_000) + 1 : 30;
  const month = now.getUTCMonth();
  const monthName = l === 'en' ? MONTHS_EN[month]! : MONTHS_ES[month]!;
  const demo = getDemo(q.demoId);
  const arch = (q.demoId && DEMO_ARCHETYPE[q.demoId]) || archetypeFor(lon, lat);
  const t = TEMPLATES[arch];
  const rand = seeded(`${round(lat, 1)}:${round(lon, 1)}${P ? `:${P.start}` : ''}`);
  const today = now.toISOString().slice(0, 10);
  const cards: RegionSensorCard[] = [];

  // 1) Humedad del suelo (SMAP)
  const smNow = t.soilMoisture[month]! + t.smAnomaly[month]!;
  const smNormal = t.soilMoisture[month]!;
  const smDiff = smNow - smNormal;
  cards.push({
    id: 'soil-moisture',
    mission: 'SMAP',
    source: 'SMAP',
    layerId: 'soil-moisture',
    date: P ? P.end : layerDate('SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', today),
    resolution: '9 km',
    confidence: 'medium',
    headline:
      smDiff <= -4
        ? tr(l, 'Más seco que lo normal', 'Drier than normal')
        : smDiff >= 4
          ? tr(l, 'Más húmedo que lo normal', 'Wetter than normal')
          : tr(l, 'Humedad normal para la época', 'Normal moisture for the season'),
    value: smNow,
    unit: '%',
    comparison: { label: tr(l, `Lo normal en ${monthName}`, `Normal in ${monthName}`), value: smNormal, unit: '%' },
    status: smDiff <= -8 ? 'alert' : smDiff <= -4 ? 'watch' : 'good',
    series: Array.from({ length: pDays }, (_, i) => round(smNormal + (smDiff * i) / Math.max(1, pDays - 1) + (rand() - 0.5) * 3)),
    seriesLabel: P ? P.label : tr(l, 'Últimos 30 días', 'Last 30 days'),
    glossary: 'soil-moisture',
    simulated: true,
  });

  // 2) Lluvia (GPM IMERG en el mapa; cifras de NASA POWER si hay)
  const valid = power?.days.filter((d) => d.precip != null) ?? [];
  if (power && valid.length >= (P ? Math.min(20, Math.ceil(pDays * 0.7)) : 20)) {
    const last30 = P ? valid : valid.slice(-30);
    const last7 = sum(last30.slice(-7).map((d) => d.precip!));
    const r30 = sum(last30.map((d) => d.precip!));
    const normal30 = power.climPrecipMmDay[month]! * last30.length;
    const pct = normal30 > 0 ? round(((r30 - normal30) / normal30) * 100) : 0;
    cards.push({
      id: 'rain',
      mission: 'NASA POWER · GPM IMERG',
      source: 'NASA POWER',
      layerId: 'rain',
      date: last30.at(-1)!.date,
      resolution: '0.5° (~55 km)',
      confidence: 'medium',
      headline:
        pct <= -30
          ? tr(l, `Llovió ${Math.abs(pct)} % menos de lo normal`, `${Math.abs(pct)}% less rain than normal`)
          : pct >= 30
            ? tr(l, `Llovió ${pct} % más de lo normal`, `${pct}% more rain than normal`)
            : tr(l, 'Lluvia cerca de lo normal', 'Rain close to normal'),
      value: P ? round(r30) : round(last7),
      unit: P ? tr(l, `mm en ${P.label}`, `mm in ${P.label}`) : tr(l, 'mm en 7 días', 'mm in 7 days'),
      comparison: P
        ? { label: tr(l, `Lo normal para esos ${last30.length} días`, `Normal for those ${last30.length} days`), value: round(normal30), unit: 'mm' }
        : {
            label: tr(l, `30 días (normal ${round(normal30)} mm)`, `30 days (normal ${round(normal30)} mm)`),
            value: round(r30),
            unit: 'mm',
          },
      status: pct <= -40 ? 'alert' : pct <= -20 ? 'watch' : 'good',
      series: last30.map((d) => round(d.precip!, 1)),
      seriesLabel: P ? tr(l, `Lluvia diaria · ${P.label}`, `Daily rain · ${P.label}`) : tr(l, 'Lluvia diaria, 30 días', 'Daily rain, 30 days'),
      glossary: 'rain',
    });
  } else {
    const normal30 = t.precip[month]!;
    const r30 = round(normal30 * (0.7 + rand() * 0.5));
    cards.push({
      id: 'rain',
      mission: 'GPM IMERG',
      source: 'GPM',
      layerId: 'rain',
      date: P ? P.end : layerDate('IMERG_Precipitation_Rate', today),
      resolution: '0.1° (~11 km)',
      confidence: 'low',
      headline: P ? tr(l, `Lluvia de ${P.label}`, `Rain in ${P.label}`) : tr(l, 'Lluvia del último mes', 'Rain in the last month'),
      value: round(r30 / 4),
      unit: tr(l, 'mm en 7 días', 'mm in 7 days'),
      comparison: { label: tr(l, `30 días (normal ${normal30} mm)`, `30 days (normal ${normal30} mm)`), value: r30, unit: 'mm' },
      status: r30 < normal30 * 0.6 ? 'watch' : 'good',
      series: Array.from({ length: 30 }, () => round(Math.max(0, (normal30 / 30) * (rand() * 2.2 - 0.4)), 1)),
      seriesLabel: tr(l, 'Lluvia diaria, 30 días', 'Daily rain, 30 days'),
      glossary: 'rain',
      simulated: true,
    });
  }

  // 3) Verdor (MODIS NDVI)
  const ndviNow = round(t.ndvi[month]! + (rand() - 0.6) * 0.08, 2);
  const ndviSeries = Array.from({ length: 12 }, (_, i) => t.ndvi[(month - 11 + i + 12) % 12]!);
  const ndviDiff = ndviNow - t.ndvi[month]!;
  cards.push({
    id: 'ndvi',
    mission: 'MODIS Terra / Aqua',
    source: 'MODIS',
    layerId: 'ndvi',
    date: P ? `${P.start.slice(0, 7)}-01` : layerDate('MODIS_Terra_L3_NDVI_Monthly', today),
    resolution: '1 km',
    confidence: 'high',
    headline:
      ndviDiff < -0.04
        ? tr(l, 'Menos verde que lo normal', 'Less green than normal')
        : tr(l, 'Verdor normal para la época', 'Normal greenness for the season'),
    value: ndviNow,
    unit: 'NDVI',
    comparison: { label: tr(l, `Normal en ${monthName}`, `Normal in ${monthName}`), value: t.ndvi[month]!, unit: 'NDVI' },
    status: ndviDiff < -0.08 ? 'alert' : ndviDiff < -0.04 ? 'watch' : 'good',
    series: [...ndviSeries.slice(0, -1), ndviNow],
    seriesLabel: P ? tr(l, `12 meses hasta ${P.label}`, `12 months up to ${P.label}`) : tr(l, 'Últimos 12 meses', 'Last 12 months'),
    glossary: 'ndvi',
    simulated: true,
  });

  // 4) Calor y heladas (NASA POWER real si hay)
  const tAll = power?.days.filter((d) => d.tmax != null && d.tmin != null) ?? [];
  const tdays = P ? tAll : tAll.slice(-30);
  if (tdays.length >= (P ? Math.min(20, Math.ceil(pDays * 0.7)) : 20)) {
    const maxT = Math.max(...tdays.map((d) => d.tmax!));
    const hot = tdays.filter((d) => d.tmax! > 35).length;
    const minT = Math.min(...(P ? tdays : tdays.slice(-7)).map((d) => d.tmin!));
    const frost = minT <= 2;
    cards.push({
      id: 'heat',
      mission: 'NASA POWER',
      source: 'NASA POWER',
      layerId: 'lst-day',
      date: tdays.at(-1)!.date,
      resolution: '0.5° (~55 km)',
      confidence: 'high',
      headline: frost
        ? tr(l, 'Noches con riesgo de helada', 'Nights with frost risk')
        : hot >= 5
          ? P
            ? tr(l, `${hot} días sobre 35 °C en ${P.label}`, `${hot} days above 35 °C in ${P.label}`)
            : tr(l, `${hot} días sobre 35 °C este mes`, `${hot} days above 35 °C this month`)
          : P
            ? tr(l, `Sin calor extremo en ${P.label}`, `No extreme heat in ${P.label}`)
            : tr(l, 'Sin calor extremo en 30 días', 'No extreme heat in 30 days'),
      value: round(maxT, 1),
      unit: tr(l, '°C máxima', '°C max'),
      comparison: { label: P ? tr(l, 'Mínima del mes', 'Lowest of the month') : tr(l, 'Mínima de la última semana', 'Lowest in the last week'), value: round(minT, 1), unit: '°C' },
      status: frost || hot >= 10 ? 'alert' : hot >= 3 ? 'watch' : 'good',
      series: tdays.map((d) => round(d.tmax!, 1)),
      seriesLabel: P ? tr(l, `Máxima diaria · ${P.label}`, `Daily max · ${P.label}`) : tr(l, 'Máxima diaria, 30 días', 'Daily max, 30 days'),
      glossary: 'heat',
    });
  } else {
    const tmax = t.tMean[month]! + t.halfRange;
    cards.push({
      id: 'heat',
      mission: 'ECOSTRESS (ISS)',
      source: 'ECOSTRESS',
      layerId: 'lst-day',
      date: today,
      resolution: '70 m',
      confidence: 'low',
      headline: t.heat[month]! > 3 ? tr(l, 'Días de calor extremo', 'Extreme heat days') : tr(l, 'Temperaturas normales', 'Normal temperatures'),
      value: round(tmax, 1),
      unit: tr(l, '°C máxima', '°C max'),
      status: t.heat[month]! > 10 ? 'alert' : t.heat[month]! > 3 ? 'watch' : 'good',
      series: Array.from({ length: 30 }, () => round(tmax + (rand() - 0.5) * 4, 1)),
      seriesLabel: tr(l, 'Máxima diaria, 30 días', 'Daily max, 30 days'),
      glossary: 'heat',
      estimated: true,
      simulated: true,
    });
  }

  // 5) Agua que pierde el campo (ECOSTRESS / MODIS ET)
  const etDay = round(Math.max(0.5, ((t.tMean[month]! + 5) * 3.2 * (0.4 + t.soilMoisture[month]! / 100)) / 30), 1);
  const rainDay = round(t.precip[month]! / 30, 1);
  cards.push({
    id: 'et',
    mission: 'ECOSTRESS (ISS) · MODIS',
    source: 'ECOSTRESS',
    layerId: 'evap',
    date: P ? P.end : today,
    resolution: '70 m',
    confidence: 'low',
    headline:
      etDay > rainDay * 1.3
        ? tr(l, 'Pierde más agua de la que llueve', 'Losing more water than it rains')
        : tr(l, 'Pérdida de agua equilibrada', 'Balanced water loss'),
    value: etDay,
    unit: tr(l, 'mm/día', 'mm/day'),
    comparison: { label: tr(l, 'Lluvia normal por día', 'Normal rain per day'), value: rainDay, unit: tr(l, 'mm/día', 'mm/day') },
    status: etDay > rainDay * 2 ? 'alert' : etDay > rainDay * 1.3 ? 'watch' : 'good',
    series: Array.from({ length: 12 }, (_, i) => {
      const m = (month - 11 + i + 12) % 12;
      return round(((t.tMean[m]! + 5) * 3.2 * (0.4 + t.soilMoisture[m]! / 100)) / 30, 1);
    }),
    seriesLabel: tr(l, 'Últimos 12 meses', 'Last 12 months'),
    glossary: 'et',
    estimated: true,
    simulated: true,
  });

  // 6) Agua subterránea (GRACE-FO)
  const trend = WATER_TREND[arch];
  cards.push({
    id: 'groundwater',
    mission: 'GRACE-FO',
    source: 'GRACE',
    layerId: 'groundwater',
    date: '2025-12-01',
    resolution: '~300 km',
    confidence: trend <= -1 ? 'high' : 'medium',
    headline:
      trend <= -0.4
        ? tr(l, 'Bajando cada año', 'Falling every year')
        : trend >= 0.3
          ? tr(l, 'Subiendo un poco', 'Rising slightly')
          : tr(l, 'Estable', 'Stable'),
    value: trend,
    unit: tr(l, 'cm/año', 'cm/year'),
    comparison: { label: tr(l, 'Cambio desde 2002', 'Change since 2002'), value: round(trend * 23), unit: 'cm' },
    status: trend <= -1 ? 'alert' : trend <= -0.4 ? 'watch' : 'good',
    series: Array.from({ length: 24 }, (_, i) => round(trend * i + (rand() - 0.5) * 3, 1)),
    seriesLabel: '2002–2025',
    glossary: 'grace',
    simulated: true,
  });

  // 7) Relieve (SRTM)
  const slope = SLOPE[arch];
  cards.push({
    id: 'relief',
    mission: 'SRTM',
    source: 'SRTM',
    layerId: 'relief',
    date: '2000-02-22',
    resolution: '30 m',
    confidence: 'high',
    headline:
      slope >= 15
        ? tr(l, 'Laderas fuertes: riesgo de erosión alto', 'Steep slopes: high erosion risk')
        : slope >= 3
          ? tr(l, 'Lomas suaves: riesgo medio', 'Gentle hills: medium risk')
          : tr(l, 'Terreno plano: poca erosión por agua', 'Flat land: little water erosion'),
    value: slope,
    unit: tr(l, '% pendiente media', '% average slope'),
    status: slope >= 15 ? 'alert' : slope >= 3 ? 'watch' : 'good',
    series: Array.from({ length: 20 }, () => round(Math.max(0, slope + (rand() - 0.5) * slope))),
    seriesLabel: tr(l, 'Perfil del terreno', 'Terrain profile'),
    glossary: 'slope',
    simulated: true,
  });

  // Alertas: frases simples a partir de las tarjetas en alerta/atención.
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const alerts: string[] = [];
  if (byId['soil-moisture']!.status !== 'good')
    alerts.push(tr(l, 'El suelo está más seco que lo normal: espera lluvias antes de sembrar o elige cultivos que aguanten sequía.', 'Soil is drier than normal: wait for rain before planting or choose drought-tolerant crops.'));
  if (byId.rain!.status !== 'good')
    alerts.push(
      P
        ? tr(l, `Llovió poco en ${P.label}: así se ve un mes seco en tu zona.`, `Little rain in ${P.label}: this is what a dry month looks like in your area.`)
        : tr(l, 'Ha llovido poco en el último mes: cuida el agua y cubre el suelo para que no se evapore.', 'Little rain in the last month: save water and cover the soil so it does not evaporate.'),
    );
  if (byId.heat!.status !== 'good') alerts.push(byId.heat!.headline + tr(l, ': revisa variedades y fechas de siembra.', ': check varieties and planting dates.'));
  if (byId.groundwater!.status !== 'good')
    alerts.push(tr(l, 'El agua subterránea baja año tras año: los cultivos que piden mucho riego son un riesgo.', 'Groundwater keeps falling: crops that need a lot of irrigation are a risk.'));
  if (byId.relief!.status === 'alert')
    alerts.push(tr(l, 'Con pendientes fuertes, mantén el suelo cubierto en la temporada de lluvias.', 'On steep slopes, keep the soil covered during the rainy season.'));
  if (!alerts.length) alerts.push(tr(l, 'Sin alertas fuertes ahora. Buen momento para planear la próxima siembra.', 'No strong alerts now. A good time to plan the next planting.'));

  const half = q.demoId ? 0.25 : 0.125;
  return {
    id: q.demoId ? `demo:${q.demoId}` : `cell:${round(lat, 2)},${round(lon, 2)}`,
    name: q.name ?? (demo ? (l === 'en' ? demo.region.en : demo.region.es) : null),
    kind: q.demoId ? 'demo' : 'cell',
    demoId: q.demoId,
    center: [lon, lat],
    bbox: [lon - half, lat - half, lon + half, lat + half],
    cards,
    alerts: alerts.slice(0, 3),
    generatedAt: new Date().toISOString(),
    period: P,
    sources: [...new Set(cards.map((c) => c.source))],
    mock: true,
  };
}
