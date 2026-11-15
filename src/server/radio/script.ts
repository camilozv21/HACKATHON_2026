/**
 * Guion del programa de la radio escrito con plantillas (sin IA), a partir de los datos del punto.
 * Es el respaldo cuando no hay Claude y también el borrador que Claude reescribe: los números, las fuentes,
 * la confianza, los vacíos y las pistas sobre el globo salen siempre de aquí.
 *
 * Escrito para oírse: frases cortas, sin símbolos ni abreviaturas ("milímetros", no "mm"), números simples.
 * Cada bloque dice de dónde sale el dato y, si es de demostración, lo dice en voz alta.
 */
import type { Hazard } from '@/features/terrain/kinds';
import type { Confidence, HazardKind, Level, RadioCue, RadioSegment, RadioTopic } from '@/lib/api/contract';
import type { ProductId } from '@/lib/market/catalog';
import { shortPlace } from '@/features/radio/local';
import { speechSeconds } from '@/features/radio/sentences';
import type { Facts, Loc } from './facts';

export type ScriptOpts = {
  locale: Loc;
  units: 'metric' | 'imperial';
  mode: 'lite' | 'full';
  role?: 'farmer' | 'technician';
  stationId: string;
  stationName: string;
  /** Nombres visibles (vienen de los mensajes de la app). */
  names: { product: (id: ProductId) => string; hazard: (kind: HazardKind) => string };
  now?: Date;
};

type Draft = {
  topic: RadioTopic;
  type: RadioSegment['type'];
  title: string;
  sentences: string[];
  cues?: RadioCue[];
  relatedLayerId?: RadioSegment['relatedLayerId'];
  dataSource?: RadioSegment['dataSource'];
  sources?: RadioSegment['sources'];
  confidence?: Confidence;
  caveat?: string;
  simulated?: boolean;
};

const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);

function speaker(o: ScriptOpts) {
  const l = o.locale;
  const fmt = (v: number, d = 0) => new Intl.NumberFormat(l === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: d }).format(v);
  const imperial = o.units === 'imperial';
  const date = (iso: string, withYear = false) =>
    new Intl.DateTimeFormat(l === 'en' ? 'en-US' : 'es-CO', {
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  const month = (iso: string) =>
    new Intl.DateTimeFormat(l === 'en' ? 'en-US' : 'es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  return {
    n: fmt,
    pct: (v: number) => `${fmt(Math.abs(v))} ${tr(l, 'por ciento', 'percent')}`,
    rain: (mm: number) =>
      imperial ? `${fmt(mm / 25.4, 1)} ${tr(l, 'pulgadas', 'inches')}` : `${fmt(mm)} ${tr(l, 'milímetros', 'millimetres')}`,
    temp: (c: number) =>
      imperial ? `${fmt((c * 9) / 5 + 32)} ${tr(l, 'grados Fahrenheit', 'degrees Fahrenheit')}` : `${fmt(c)} ${tr(l, 'grados', 'degrees Celsius')}`,
    date,
    month,
  };
}

const LEVEL_WORD: Record<Level, [string, string]> = { high: ['alto', 'high'], medium: ['medio', 'medium'], low: ['bajo', 'low'] };
const CONF_WORD: Record<Confidence, [string, string]> = { high: ['alta', 'high'], medium: ['media', 'medium'], low: ['baja', 'low'] };
const HAZARD_WORD: Record<Hazard, [string, string]> = {
  drought: ['sequía', 'drought'],
  water: ['encharcamiento o inundación', 'waterlogging or flooding'],
  heat: ['calor', 'heat'],
  soil: ['desgaste del suelo', 'soil degradation'],
};
const pick = (l: Loc, pair: [string, string]) => (l === 'en' ? pair[1] : pair[0]);

/** Hora solar aproximada del lugar (para el saludo): UTC + longitud / 15. */
function greeting(l: Loc, lon: number, now: Date) {
  const h = (((now.getUTCHours() + lon / 15) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return tr(l, 'Buenos días', 'Good morning');
  if (h >= 12 && h < 19) return tr(l, 'Buenas tardes', 'Good afternoon');
  return tr(l, 'Buenas noches', 'Good evening');
}

// ---------------------------------------------------------------- bloques

function intro(f: Facts, o: ScriptOpts): Draft {
  const l = o.locale;
  const s = speaker(o);
  const now = o.now ?? new Date();
  const extras = f.market ? tr(l, ', el suelo, las plantas y los precios', ', the soil, the crops and prices') : tr(l, ', el suelo y las plantas', ', the soil and the crops');
  return {
    topic: 'intro',
    type: 'news',
    title: tr(l, `Boletín de ${shortPlace(f.place)}`, `${shortPlace(f.place)} bulletin`),
    sentences: [
      tr(l, `${greeting(l, f.lon, now)}. Estás escuchando ${o.stationName}, el boletín del campo de ${f.place}.`, `${greeting(l, f.lon, now)}. You are listening to ${o.stationName}, the farm bulletin for ${f.place}.`),
      o.mode === 'lite'
        ? tr(l, 'Te cuento cómo vienen la lluvia y el suelo, con datos de satélites de la NASA.', 'Here is how the rain and the soil are doing, with data from NASA satellites.')
        : tr(l, `Hoy, ${s.date(f.today)}, te contamos cómo vienen la lluvia${extras}, con datos de satélites de la NASA.`, `Today, ${s.date(f.today)}, we look at the rain${extras}, with data from NASA satellites.`),
    ],
    cues: [{ sentence: 0, action: { type: 'flyTo', lat: f.lat, lon: f.lon, zoom: 8.5, label: f.place } }],
  };
}

function weather(f: Facts, o: ScriptOpts): Draft | null {
  const { rain, heat } = f;
  if (!rain && !heat) return null;
  const l = o.locale;
  const s = speaker(o);
  const lite = o.mode === 'lite';
  const sentences: string[] = [];
  const cues: RadioCue[] = [{ sentence: 0, action: { type: 'setLayer', layerId: 'rain' } }];
  if (rain) {
    sentences.push(
      rain.pct <= -20
        ? tr(l, `En los últimos 30 días llovieron ${s.rain(rain.last30)}: ${s.pct(rain.pct)} menos de lo normal para esta época.`, `In the last 30 days there were ${s.rain(rain.last30)} of rain: ${s.pct(rain.pct)} less than normal for this time of year.`)
        : rain.pct >= 20
          ? tr(l, `En los últimos 30 días llovieron ${s.rain(rain.last30)}: ${s.pct(rain.pct)} más de lo normal para esta época.`, `In the last 30 days there were ${s.rain(rain.last30)} of rain: ${s.pct(rain.pct)} more than normal for this time of year.`)
          : tr(l, `En los últimos 30 días llovieron ${s.rain(rain.last30)}, cerca de lo normal para esta época.`, `In the last 30 days there were ${s.rain(rain.last30)} of rain, close to normal for this time of year.`),
    );
    if (!lite) sentences.push(tr(l, `En la última semana cayeron ${s.rain(rain.last7)}.`, `Last week brought ${s.rain(rain.last7)}.`));
    if (rain.simulated) sentences.push(tr(l, 'Ojo: este dato de lluvia es de demostración, no una medición.', 'Note: this rain figure is a demo value, not a measurement.'));
  }
  if (heat) {
    const at = sentences.length;
    if (heat.frost) {
      sentences.push(tr(l, `Cuidado con las noches: esta semana la mínima bajó a ${s.temp(heat.minT7)}, con riesgo de helada.`, `Watch the nights: this week the low dropped to ${s.temp(heat.minT7)}, with a risk of frost.`));
      cues.push({ sentence: at, action: { type: 'setLayer', layerId: 'lst-night' } });
    } else if (heat.hotDays >= 3) {
      sentences.push(tr(l, `Hubo ${heat.hotDays} días por encima de ${s.temp(35)}.`, `There were ${heat.hotDays} days above ${s.temp(35)}.`));
      cues.push({ sentence: at, action: { type: 'setLayer', layerId: 'lst-day' } });
    } else if (!lite) {
      sentences.push(tr(l, `La temperatura máxima del mes llegó a ${s.temp(heat.maxT)}.`, `The highest temperature this month was ${s.temp(heat.maxT)}.`));
    }
  }
  if (!lite) sentences.push(tr(l, 'Es lo que midieron los satélites, no un pronóstico.', 'This is what satellites measured, not a forecast.'));
  if (o.role === 'technician' && !lite) sentences.push(tr(l, 'Datos diarios de NASA POWER, en celdas de medio grado.', 'Daily NASA POWER data, on half-degree cells.'));
  const strong = (rain && rain.pct <= -40) || heat?.frost || (heat?.hotDays ?? 0) >= 5;
  return {
    topic: 'weather',
    type: strong ? 'alert' : 'news',
    title: tr(l, 'Lluvia y temperatura', 'Rain and temperature'),
    sentences,
    cues,
    relatedLayerId: 'rain',
    dataSource: rain?.simulated ? 'GPM' : 'NASA POWER',
    sources: [{ dataset: rain?.simulated ? 'GPM IMERG' : 'NASA POWER', date: rain?.date ?? heat?.date }],
    confidence: rain?.simulated ? 'low' : 'medium',
    caveat: tr(l, 'Lluvia medida por satélite en celdas de unos 55 kilómetros: no es un pronóstico y tu lote puede variar.', 'Satellite rain on cells of about 55 kilometres: not a forecast, and your plot may differ.'),
    simulated: rain?.simulated || undefined,
  };
}

function soil(f: Facts, o: ScriptOpts): Draft | null {
  const sm = f.soil;
  if (!sm) return null;
  const l = o.locale;
  const s = speaker(o);
  const lite = o.mode === 'lite';
  const diff = sm.normal == null ? 0 : sm.value - sm.normal;
  const m = s.month(f.today);
  const sentences: string[] = [];
  if (diff <= -4) {
    sentences.push(tr(l, `El satélite SMAP ve el suelo más seco que lo normal para ${m}.`, `The SMAP satellite sees the soil drier than normal for ${m}.`));
    sentences.push(tr(l, 'Antes de sembrar, espera una buena lluvia o elige cultivos que aguanten la sequía.', 'Before planting, wait for good rain or choose drought-tolerant crops.'));
  } else if (diff >= 4) {
    sentences.push(tr(l, `El satélite SMAP ve el suelo más húmedo que lo normal para ${m}.`, `The SMAP satellite sees the soil wetter than normal for ${m}.`));
    sentences.push(tr(l, 'Cuidado con los encharcamientos: revisa los drenajes antes de sembrar.', 'Watch for waterlogging: check the drainage before planting.'));
  } else {
    sentences.push(tr(l, `La humedad del suelo, que mide el satélite SMAP, está normal para ${m}.`, `Soil moisture, measured by the SMAP satellite, is normal for ${m}.`));
  }
  if (!lite && sm.normal != null) {
    sentences.push(tr(l, `Hoy marca ${s.n(sm.value)} por ciento de humedad; lo normal es ${s.n(sm.normal)}.`, `It reads ${s.n(sm.value)} percent moisture today; normal is ${s.n(sm.normal)}.`));
  }
  if (!lite && f.et && f.et.status !== 'good') {
    sentences.push(tr(l, 'Además, el calor y el viento se llevan más agua de la que llueve.', 'Also, heat and wind are taking more water than the rain brings.'));
  }
  if (sm.simulated) sentences.push(tr(l, 'Por ahora este dato es de demostración: la app todavía no lee la medición real de SMAP.', 'For now this is a demo value: the app does not read the real SMAP measurement yet.'));
  return {
    topic: 'soil',
    type: diff <= -8 ? 'alert' : 'news',
    title: tr(l, 'Humedad del suelo', 'Soil moisture'),
    sentences,
    cues: [{ sentence: 0, action: { type: 'setLayer', layerId: 'soil-moisture' } }],
    relatedLayerId: 'soil-moisture',
    dataSource: 'SMAP',
    sources: [{ dataset: 'SMAP', date: sm.date }],
    confidence: sm.simulated ? 'low' : 'medium',
    caveat: tr(l, 'SMAP mide en celdas de 9 kilómetros: tu lote puede estar distinto.', 'SMAP measures on 9-kilometre cells: your plot may be different.'),
    simulated: sm.simulated || undefined,
  };
}

function vegetation(f: Facts, o: ScriptOpts): Draft | null {
  const nd = f.ndvi;
  if (!nd) return null;
  const low = nd.normal != null && nd.value - nd.normal < -0.04;
  if (o.mode === 'lite' && nd.status !== 'alert') return null;
  const l = o.locale;
  const sentences = low
    ? [
        tr(l, 'Las plantas se ven menos verdes que lo normal. Es lo que los técnicos llaman NDVI: el verdor que ve el satélite MODIS.', 'Crops look less green than normal. Technicians call this NDVI: the greenness the MODIS satellite sees.'),
        tr(l, 'Puede ser falta de agua o el final de una cosecha: vale la pena caminar el lote.', 'It may be lack of water or the end of a harvest: it is worth walking the plot.'),
      ]
    : [tr(l, 'El verdor de las plantas, que el satélite MODIS mide con el NDVI, está normal para la época.', 'Crop greenness, which the MODIS satellite measures as NDVI, is normal for the season.')];
  if (nd.simulated) sentences.push(tr(l, 'Este valor también es de demostración.', 'This value is also a demo value.'));
  return {
    topic: 'vegetation',
    type: nd.status === 'alert' ? 'alert' : 'news',
    title: tr(l, 'Verdor de las plantas', 'Crop greenness'),
    sentences,
    cues: [{ sentence: 0, action: { type: 'setLayer', layerId: 'ndvi' } }],
    relatedLayerId: 'ndvi',
    dataSource: 'MODIS',
    sources: [{ dataset: 'MODIS NDVI', date: nd.date }],
    confidence: nd.simulated ? 'low' : 'high',
    caveat: tr(l, 'El NDVI no distingue un bosque de un cultivo sano, y un lote recién arado se ve como suelo desnudo.', 'NDVI does not tell a forest from a healthy crop, and a freshly ploughed plot looks like bare soil.'),
    simulated: nd.simulated || undefined,
  };
}

function events(f: Facts, o: ScriptOpts): Draft | null {
  const ev = f.events;
  if (!ev || (!ev.nearby.length && !ev.ungrd)) return null;
  const l = o.locale;
  const s = speaker(o);
  const sentences: string[] = [];
  const n = ev.nearby.length;
  const DAY = 86_400_000;
  const recent = ev.nearby.filter((e) => Date.parse(f.today) - Date.parse(e.date) <= 30 * DAY);
  if (n) {
    sentences.push(
      n === 1
        ? tr(l, 'En los últimos tres meses hubo un evento a menos de 50 kilómetros.', 'In the last three months there was one event within 50 kilometres.')
        : tr(l, `En los últimos tres meses hubo ${n} eventos a menos de 50 kilómetros.`, `In the last three months there were ${n} events within 50 kilometres.`),
    );
    const e = ev.nearby[0]!;
    const what = o.names.hazard(e.kind).toLocaleLowerCase(l === 'en' ? 'en-US' : 'es-CO');
    sentences.push(
      e.place
        ? tr(l, `El más reciente fue el ${s.date(e.date)}: ${what} cerca de ${shortPlace(e.place)}.`, `The latest was on ${s.date(e.date)}: ${what} near ${shortPlace(e.place)}.`)
        : tr(l, `El más reciente fue el ${s.date(e.date)}: ${what}.`, `The latest was on ${s.date(e.date)}: ${what}.`),
    );
    if (ev.nearby.some((x) => x.source === 'community' && !x.verified)) {
      sentences.push(tr(l, 'Hay reportes de la comunidad que todavía no están verificados.', 'Some reports come from the community and are not verified yet.'));
    }
  }
  if (ev.ungrd && f.colombia && o.mode !== 'lite') {
    const top = ev.ungrd.topKind ? o.names.hazard(ev.ungrd.topKind).toLocaleLowerCase(l === 'en' ? 'en-US' : 'es-CO') : null;
    sentences.push(
      tr(l, `Desde ${ev.ungrd.from}, el registro oficial de la UNGRD cuenta ${s.n(ev.ungrd.total)} emergencias en ${f.colombia.mpio}.`, `Since ${ev.ungrd.from}, the official UNGRD record counts ${s.n(ev.ungrd.total)} emergencies in ${f.colombia.mpio}.`) +
        (top ? tr(l, ` La más frecuente: ${top}.`, ` The most common: ${top}.`) : ''),
    );
  }
  if (f.colombia && recent.some((e) => e.kind === 'landslide' || e.kind === 'flood')) {
    sentences.push(tr(l, 'Si hay personas en peligro, llama al 123.', 'If people are in danger, call 123.'));
  }
  return {
    topic: 'events',
    type: recent.length ? 'alert' : 'news',
    title: tr(l, 'Eventos cerca', 'Events nearby'),
    sentences,
    cues: [{ sentence: 0, action: { type: 'showEvents', on: true } }],
    sources: [
      { dataset: 'NASA EONET', date: f.today },
      ...(f.colombia ? [{ dataset: 'UNGRD', date: ev.ungrd ? String(ev.ungrd.to) : undefined }] : []),
    ],
    confidence: 'medium',
    caveat: tr(l, 'La UNGRD publica con retraso y ubica cada emergencia en el centro del municipio. Los reportes de la comunidad no están verificados.', 'UNGRD publishes with a delay and places each emergency at the centre of the municipality. Community reports are not verified.'),
  };
}

function terrain(f: Facts, o: ScriptOpts): Draft | null {
  const t = f.terrain;
  if (!t || !t.level) return null;
  if (o.mode === 'lite' && t.level === 'low') return null;
  const l = o.locale;
  const s = speaker(o);
  const mpio = shortPlace(t.place);
  const sentences = [
    tr(l, `Según las zonas de riesgo, que calculamos con satélites de la NASA en Google Earth Engine, ${mpio} tiene riesgo ${pick(l, LEVEL_WORD[t.level])}`, `According to the risk zones, computed with NASA satellites in Google Earth Engine, ${mpio} has ${pick(l, LEVEL_WORD[t.level])} risk`) +
      // "Riesgo bajo, sobre todo por…" no tiene sentido: la causa solo se dice si ese riesgo pesa.
      (t.top && t.topLevel && t.topLevel !== 'low' ? tr(l, `, sobre todo por ${pick(l, HAZARD_WORD[t.top])}.`, `, mainly from ${pick(l, HAZARD_WORD[t.top])}.`) : '.'),
  ];
  if (o.mode !== 'lite') {
    // "2016–2018" se lee mal en voz alta: "2016 a 2018".
    const [p0, p1] = t.periods.map((p) => p.replace(/\s*[–-]\s*/, tr(l, ' a ', ' to ')));
    sentences.push(tr(l, `Entre ${p0} y ${p1}, la tierra sana pasó de ${s.n(t.healthy0)} a ${s.n(t.healthy1)} por ciento.`, `Between ${p0} and ${p1}, healthy land went from ${s.n(t.healthy0)} to ${s.n(t.healthy1)} percent.`));
  }
  sentences.push(tr(l, `La confianza de este cálculo es ${pick(l, CONF_WORD[t.confidence])}, y es un promedio del municipio, no de tu finca.`, `Confidence in this estimate is ${pick(l, CONF_WORD[t.confidence])}, and it is an average for the municipality, not your farm.`));
  if (t.synthetic) sentences.push(tr(l, 'Ojo: estos datos del terreno son de prueba.', 'Note: this terrain data is test data.'));
  return {
    topic: 'terrain',
    type: t.level === 'high' ? 'alert' : 'news',
    title: tr(l, 'Riesgo del terreno', 'Land risk'),
    sentences,
    cues: [{ sentence: 0, action: { type: 'setLayer', layerId: 'risk', risk: t.top ?? 'all' } }],
    relatedLayerId: 'risk',
    sources: [{ dataset: 'Google Earth Engine: SMAP, GPM, MODIS, GRACE, SRTM', date: t.periods[1] }],
    confidence: t.confidence,
    caveat: tr(l, 'Promedio del municipio. Los años futuros suponen que la tierra sigue cambiando al mismo ritmo.', 'Municipality average. Future years assume the land keeps changing at the same pace.'),
    simulated: t.synthetic || undefined,
  };
}

function market(f: Facts, o: ScriptOpts): Draft | null {
  const m = f.market;
  if (!m || !m.products.length || o.mode === 'lite') return null;
  const l = o.locale;
  const s = speaker(o);
  const where = m.nearestMarket ? tr(l, `En la central de ${m.nearestMarket}`, `At the ${m.nearestMarket} wholesale market`) : tr(l, 'En la central mayorista más cercana', 'At the nearest wholesale market');
  const sentences: string[] = [];
  m.products.slice(0, 2).forEach((p, i) => {
    const name = o.names.product(p.product).toLocaleLowerCase(l === 'en' ? 'en-US' : 'es-CO');
    const change =
      p.change12mPct != null && Math.abs(p.change12mPct) >= 5
        ? p.change12mPct > 0
          ? tr(l, `, ${s.pct(p.change12mPct)} más que hace un año`, `, ${s.pct(p.change12mPct)} more than a year ago`)
          : tr(l, `, ${s.pct(p.change12mPct)} menos que hace un año`, `, ${s.pct(p.change12mPct)} less than a year ago`)
        : '';
    sentences.push(
      i === 0
        ? tr(l, `${where}, el kilo de ${name} va en ${s.n(p.priceCopKg)} pesos${change}.`, `${where}, ${name} sells for ${s.n(p.priceCopKg)} pesos per kilo${change}.`)
        : tr(l, `El de ${name}, en ${s.n(p.priceCopKg)} pesos${change}.`, `${name[0]!.toUpperCase()}${name.slice(1)}, ${s.n(p.priceCopKg)} pesos${change}.`),
    );
  });
  const good = m.products.find((p) => p.outlook === 'favorable');
  if (good) {
    const name = o.names.product(good.product).toLocaleLowerCase(l === 'en' ? 'en-US' : 'es-CO');
    sentences.push(tr(l, `Para ${name}, el panorama de precio se ve favorable.`, `For ${name}, the price outlook looks favourable.`));
  }
  sentences.push(tr(l, 'Son precios mayoristas: al productor le pagan menos y no se restan los costos.', 'These are wholesale prices: farmers get less, and costs are not subtracted.'));
  const cues: RadioCue[] = [];
  if (f.listings > 0) {
    cues.push({ sentence: sentences.length, action: { type: 'showListings', on: true } });
    sentences.push(
      f.listings === 1
        ? tr(l, 'Y una finca de la zona publicó su cosecha en la app.', 'And one farm nearby has listed its harvest in the app.')
        : tr(l, `Y ${f.listings} fincas de la zona publicaron su cosecha en la app.`, `And ${f.listings} farms nearby have listed their harvest in the app.`),
    );
  }
  return {
    topic: 'market',
    type: 'news',
    title: tr(l, 'Precios de la zona', 'Local prices'),
    sentences,
    cues,
    dataSource: 'SIPSA',
    sources: [{ dataset: 'DANE SIPSA', date: m.asOf.slice(0, 7) }],
    confidence: 'medium',
    caveat: tr(l, 'Un precio alto hoy puede bajar si muchos siembran lo mismo.', 'A high price today can fall if many people plant the same crop.'),
  };
}

function advice(f: Facts, o: ScriptOpts): Draft {
  const l = o.locale;
  const dry = (f.soil?.normal != null && f.soil.value - f.soil.normal <= -4) || (f.rain != null && f.rain.pct <= -20);
  const wet = (f.soil?.normal != null && f.soil.value - f.soil.normal >= 4) || (f.rain != null && f.rain.pct >= 30) || f.terrain?.top === 'water';
  const steep = (f.slope?.value ?? 0) >= 15;
  const hot = f.heat ? f.heat.hotDays >= 3 : false;
  const tip = dry
    ? tr(l, 'Un consejo: deja rastrojo o un cultivo de cobertura sobre el suelo; así guarda mejor la humedad.', 'A tip: leave crop residue or a cover crop on the soil; it holds moisture better.')
    : wet
      ? tr(l, 'Un consejo: abre drenajes y evita sembrar en las partes bajas que se encharcan.', 'A tip: open drainage and avoid planting in low spots that get waterlogged.')
      : steep
        ? tr(l, 'Un consejo: en las laderas, mantén el suelo cubierto en la temporada de lluvias para que no se lave.', 'A tip: on slopes, keep the soil covered in the rainy season so it does not wash away.')
        : hot
          ? tr(l, 'Un consejo: busca variedades que aguanten el calor y siembra en las horas frescas.', 'A tip: look for heat-tolerant varieties and plant in the cool hours.')
          : f.groundwater?.status === 'alert'
            ? tr(l, 'Un consejo: los cultivos que piden mucho riego son un riesgo, porque el agua subterránea viene bajando.', 'A tip: crops that need a lot of irrigation are a risk, because groundwater keeps falling.')
            : tr(l, 'Un consejo para la próxima siembra: rota con una leguminosa, como el fríjol; le devuelve nitrógeno al suelo.', 'A tip for the next planting: rotate with a legume, such as beans; it gives nitrogen back to the soil.');
  const sentences = [tip];
  if (o.mode !== 'lite') sentences.push(tr(l, 'Si marcas tu finca en el mapa, la app compara rotaciones para tu lote.', 'If you mark your farm on the map, the app compares rotations for your plot.'));
  return {
    topic: 'advice',
    type: 'tip',
    title: tr(l, 'Consejo del día', 'Tip of the day'),
    sentences,
    dataSource: 'Modelo agronómico',
    sources: [{ dataset: tr(l, 'Modelo agronómico de la app', 'App agronomic model') }],
    confidence: 'medium',
    caveat: tr(l, 'Es un consejo general: confírmalo con un técnico de tu zona.', 'This is general advice: check it with a local adviser.'),
  };
}

function outro(f: Facts, o: ScriptOpts): Draft {
  const l = o.locale;
  return {
    topic: 'outro',
    type: 'news',
    title: tr(l, 'Cierre', 'Sign-off'),
    sentences: [
      tr(l, `Esto fue ${o.stationName}.`, `That was ${o.stationName}.`),
      tr(l, 'Recuerda: esta información te apoya, pero no reemplaza tu criterio ni el de los técnicos de tu zona.', 'Remember: this information supports you, but it does not replace your judgement or local experts.'),
      ...(o.mode === 'lite' ? [] : [tr(l, `En el mapa tienes todos los datos de ${shortPlace(f.place)}.`, `All the data for ${shortPlace(f.place)} is on the map.`)]),
    ],
    cues: [{ sentence: 0, action: { type: 'openRegion', lat: f.lat, lon: f.lon, name: f.place } }],
  };
}

// ---------------------------------------------------------------- programa

export function toSegment(d: Draft, f: Facts, o: ScriptOpts): RadioSegment {
  const transcript = d.sentences.join(' ');
  return {
    id: `${o.stationId}:${f.today}:${d.topic}`,
    type: d.type,
    title: d.title,
    durationSec: speechSeconds(transcript, o.mode === 'lite' ? 0.92 : 1),
    transcript,
    regionId: o.stationId,
    language: o.locale,
    topic: d.topic,
    ...(d.relatedLayerId ? { relatedLayerId: d.relatedLayerId } : {}),
    ...(d.dataSource ? { dataSource: d.dataSource } : {}),
    ...(d.sources ? { sources: d.sources } : {}),
    ...(d.confidence ? { confidence: d.confidence } : {}),
    ...(d.caveat ? { caveat: d.caveat } : {}),
    ...(d.simulated ? { simulated: true } : {}),
    ...(d.cues?.length ? { cues: d.cues } : {}),
  };
}

/** Programa completo (de 4 a 9 bloques) en el orden de RADIO_TOPICS. */
export function rulesDrafts(f: Facts, o: ScriptOpts): Draft[] {
  return [intro(f, o), weather(f, o), soil(f, o), vegetation(f, o), events(f, o), terrain(f, o), market(f, o), advice(f, o), outro(f, o)].filter(
    (d): d is Draft => d !== null && d.sentences.length > 0,
  );
}

export function rulesProgram(f: Facts, o: ScriptOpts): RadioSegment[] {
  return rulesDrafts(f, o).map((d) => toSegment(d, f, o));
}
