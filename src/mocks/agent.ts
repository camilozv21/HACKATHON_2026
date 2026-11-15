/**
 * Agente mock local (sin n8n): reconoce frases simples ("muéstrame X en Y", "cómo está la lluvia en mi zona",
 * "qué rotación me conviene si hay sequía") y responde con el mismo contrato que el agente real.
 */
import type { LayerId } from '@/features/layers/ids';
import type { AgentRequest, AgentResponse, DataNeed, HazardKind } from '@/lib/api/contract';
import { env } from '@/lib/env';
import { parseTimeParam, periodLabel, periodOf, presets } from '@/features/time/period';
import { buildMockRegion } from './region';

type Loc = 'es' | 'en';
const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PLACES: { keys: string[]; name: { es: string; en: string }; lon: number; lat: number; zoom: number; demo?: string }[] = [
  { keys: ['punjab', 'ludhiana'], name: { es: 'Punjab, India', en: 'Punjab, India' }, lon: 75.75, lat: 30.85, zoom: 6.5, demo: 'punjab-ludhiana' },
  { keys: ['valle del cauca', 'cali', 'palmira'], name: { es: 'Valle del Cauca, Colombia', en: 'Valle del Cauca, Colombia' }, lon: -76.3, lat: 3.75, zoom: 7.2 },
  { keys: ['quindio', 'eje cafetero', 'armenia', 'zona cafetera'], name: { es: 'Quindío, Colombia', en: 'Quindío, Colombia' }, lon: -75.73, lat: 4.53, zoom: 8, demo: 'cafe-quindio' },
  { keys: ['iowa', 'corn belt', 'cinturon del maiz'], name: { es: 'Iowa, EE. UU.', en: 'Iowa, USA' }, lon: -93.5, lat: 42.03, zoom: 6.5, demo: 'cornbelt-iowa' },
  { keys: ['sahel', 'niger', 'maradi'], name: { es: 'Maradi, Níger (Sahel)', en: 'Maradi, Niger (Sahel)' }, lon: 7.06, lat: 13.45, zoom: 6.5, demo: 'sahel-maradi' },
  { keys: ['pampa', 'pergamino', 'buenos aires'], name: { es: 'Pergamino, Argentina', en: 'Pergamino, Argentina' }, lon: -60.6, lat: -33.95, zoom: 7, demo: 'pampa-pergamino' },
  { keys: ['la guajira', 'guajira', 'riohacha'], name: { es: 'Riohacha, La Guajira', en: 'Riohacha, La Guajira' }, lon: -72.91, lat: 11.53, zoom: 7 },
  { keys: ['choco', 'quibdo'], name: { es: 'Quibdó, Chocó', en: 'Quibdó, Chocó' }, lon: -76.66, lat: 5.69, zoom: 7.5 },
  { keys: ['caqueta', 'florencia'], name: { es: 'Florencia, Caquetá', en: 'Florencia, Caquetá' }, lon: -75.61, lat: 1.61, zoom: 7.5 },
  { keys: ['colombia'], name: { es: 'Colombia', en: 'Colombia' }, lon: -74.3, lat: 4.6, zoom: 4.8 },
];

/** Zonas de riesgo y cambios del terreno (Markov): capa `risk`, solo Colombia. */
const RISK_RE =
  /(zonas? de riesgo|mapa de riesgo|risk zones?|risk map|markov|cambi\w* (del|el) terreno|estado del terreno|land chang|riesgo de (sequia|inundacion|encharcamiento|calor|erosion|degradacion)|(drought|flood|heat|erosion) risk)/;
const CO_BOX = [-81.8, -4.3, -66.8, 13.5] as const;
const inColombia = (lon: number, lat: number) => lon >= CO_BOX[0] && lon <= CO_BOX[2] && lat >= CO_BOX[1] && lat <= CO_BOX[3];

function riskKindOf(text: string): 'all' | 'drought' | 'water' | 'heat' | 'soil' {
  if (/(sequia|drought|seco|dry)/.test(text)) return 'drought';
  if (/(inundac|encharc|flood|waterlog)/.test(text)) return 'water';
  if (/(calor|heat|caliente|hot)/.test(text)) return 'heat';
  if (/(erosion|degrad|suelo|soil)/.test(text)) return 'soil';
  return 'all';
}

const RISK_LABEL = {
  all: { es: '', en: '' },
  drought: { es: ' de **sequía**', en: ' for **drought**' },
  water: { es: ' de **encharcamiento o inundación**', en: ' for **waterlogging or flooding**' },
  heat: { es: ' de **calor**', en: ' for **heat**' },
  soil: { es: ' de **degradación del suelo**', en: ' for **soil degradation**' },
} as const;

const LAYER_WORDS: { layer: LayerId; words: string[]; label: { es: string; en: string }; dataset: string }[] = [
  { layer: 'soil-moisture', words: ['humedad del suelo', 'humedad', 'soil moisture', 'smap'], label: { es: 'humedad del suelo (SMAP)', en: 'soil moisture (SMAP)' }, dataset: 'SMAP L4 Root Zone Soil Moisture' },
  { layer: 'rain', words: ['lluvia', 'llueve', 'llover', 'precipitacion', 'rain', 'imerg', 'gpm'], label: { es: 'lluvia (GPM IMERG)', en: 'rain (GPM IMERG)' }, dataset: 'GPM IMERG' },
  { layer: 'ndvi', words: ['verdor', 'ndvi', 'vegetacion', 'verde', 'greenness', 'vegetation'], label: { es: 'verdor de las plantas (MODIS NDVI)', en: 'plant greenness (MODIS NDVI)' }, dataset: 'MODIS Terra NDVI' },
  { layer: 'lst-night', words: ['helada', 'heladas', 'frost', 'frio'], label: { es: 'frío nocturno (MODIS)', en: 'night cold (MODIS)' }, dataset: 'MODIS Land Surface Temperature' },
  { layer: 'lst-day', words: ['temperatura', 'calor', 'heat', 'temperature', 'caliente'], label: { es: 'calor del suelo (MODIS)', en: 'ground heat (MODIS)' }, dataset: 'MODIS Land Surface Temperature' },
  { layer: 'groundwater', words: ['agua subterranea', 'groundwater', 'grace', 'acuifero', 'pozos'], label: { es: 'agua subterránea (GRACE)', en: 'groundwater (GRACE)' }, dataset: 'GRACE/GRACE-FO Mascon' },
  { layer: 'evap', words: ['evapotranspiracion', 'evaporacion', 'evapotranspiration', 'pierde agua'], label: { es: 'agua que pierde el campo', en: 'water the field loses' }, dataset: 'MERRA-2 Land Evaporation' },
  { layer: 'relief', words: ['relieve', 'pendiente', 'ladera', 'erosion', 'slope'], label: { es: 'relieve (SRTM)', en: 'relief (SRTM)' }, dataset: 'SRTM' },
];

const MONTHS: [number, string[]][] = [
  [1, ['enero', 'january']],
  [2, ['febrero', 'february']],
  [3, ['marzo', 'march']],
  [4, ['abril', 'april']],
  [5, ['mayo']],
  [6, ['junio', 'june']],
  [7, ['julio', 'july']],
  [8, ['agosto', 'august']],
  [9, ['septiembre', 'setiembre', 'september']],
  [10, ['octubre', 'october']],
  [11, ['noviembre', 'november']],
  [12, ['diciembre', 'december']],
];

/**
 * Máquina del tiempo: "en mayo", "mayo de 2025", "in May 2026", "el mes pasado", "2026-05".
 * Sin año: el mayo más reciente que ya pasó. ("may" en inglés solo con "in/during/last" o con año, para no
 * confundirlo con el verbo.)
 */
export function detectWhen(text: string, now = new Date()): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}(?:-\d{2})?)\b/);
  if (iso && parseTimeParam(iso[1], now)) return iso[1]!;
  if (/\b(el mes pasado|mes anterior|last month)\b/.test(text)) return presets(now).lastMonth;
  const latestYm = presets(now).thisMonth;
  const tryMonth = (m: number, year?: string) => {
    const pad = String(m).padStart(2, '0');
    if (year) return parseTimeParam(`${year}-${pad}`, now) ? `${year}-${pad}` : null;
    const y = Number(latestYm.slice(0, 4));
    const ym = `${y}-${pad}` <= latestYm ? `${y}-${pad}` : `${y - 1}-${pad}`;
    return parseTimeParam(ym, now) ? ym : null;
  };
  for (const [m, words] of MONTHS) {
    for (const w of words) {
      const r = new RegExp(`\\b${w}\\b(?:\\s+(?:de|del|of)?\\s*(\\d{4}))?`);
      const hit = text.match(r);
      if (hit) return tryMonth(m, hit[1]);
    }
  }
  const may = text.match(/\b(?:in|during|last)\s+may\b(?:\s+(\d{4}))?|\bmay\s+(\d{4})\b/);
  if (may) return tryMonth(5, may[1] ?? may[2]);
  return null;
}

/** Preguntas cortas por cada dato que le falta al análisis de la finca. */
const ASK: Record<DataNeed, { es: string; en: string }> = {
  'current-rotation': { es: '¿Qué siembras hoy y en qué meses?', en: 'What do you plant today, and in which months?' },
  'soil-type': { es: '¿Cómo es tu tierra: arenosa, franca o arcillosa?', en: 'What is your soil like: sandy, loamy or clay?' },
  irrigation: { es: '¿Tienes riego o dependes de la lluvia?', en: 'Do you have irrigation or depend on rain?' },
  drainage: { es: '¿Se encharca tu parcela después de un aguacero?', en: 'Does your plot get waterlogged after heavy rain?' },
  'soil-test': { es: '¿Tienes un análisis de suelo (pH y materia orgánica)?', en: 'Do you have a soil test (pH and organic matter)?' },
};

const HAZARD_WORDS: { kind: HazardKind; re: RegExp }[] = [
  { kind: 'landslide', re: /(deslizamiento|derrumbe|movimiento en masa|landslide|mudslide)/ },
  { kind: 'flood', re: /(inundacion|creciente|avenida torrencial|flood)/ },
  { kind: 'storm', re: /(vendaval|granizo|granizada|tormenta|hail|windstorm|storm)/ },
  { kind: 'wildfire', re: /(incendio|quema|wildfire|fire)/ },
  { kind: 'frost', re: /(helada|frost)/ },
  { kind: 'drought', re: /(sequia|drought)/ },
];

const HAZARD_LABEL: Record<HazardKind, { es: string; en: string }> = {
  landslide: { es: 'deslizamiento', en: 'landslide' },
  flood: { es: 'inundación o creciente', en: 'flood' },
  storm: { es: 'vendaval o granizo', en: 'windstorm or hail' },
  wildfire: { es: 'incendio', en: 'fire' },
  drought: { es: 'sequía', en: 'drought' },
  frost: { es: 'helada', en: 'frost' },
  erosion: { es: 'erosión', en: 'erosion' },
  earthquake: { es: 'sismo', en: 'earthquake' },
  volcano: { es: 'volcán', en: 'volcano' },
  other: { es: 'evento', en: 'event' },
};

export function buildMockAgentResponse(req: AgentRequest): AgentResponse {
  const l = req.locale;
  const text = norm(req.message);
  const layer = LAYER_WORDS.find((w) => w.words.some((k) => text.includes(norm(k))));
  const known = PLACES.find((p) => p.keys.some((k) => text.includes(k)));
  const mine = /\b(mi zona|mi finca|aqui|donde estoy|my area|my farm|here|near me)\b/.test(text);
  const wantsRadio = /\b(radio|boletin|bulletin|emisora|escuchar|listen)\b/.test(text);
  const wantsRisk = !wantsRadio && RISK_RE.test(text);
  const wantsRotation = /(rotacion|rotation|sequia|drought|que sembrar|what to plant|cultivo me conviene|which crop)/.test(text);
  const wantsMissing = /(que (datos|te) falta|que necesitas saber|completar (el |mi )?analisis|what (data|do you need)|complete (the|my) analysis)/.test(text);
  const missing = req.view.fieldId ? (req.view.missingData ?? []) : [];
  // Eventos y emergencias: verlos en el mapa o reportar uno (el formulario lo envía la persona, no el agente).
  const hazardKind = HAZARD_WORDS.find((h) => h.re.test(text))?.kind;
  // Comprar o vender cosecha: fincas que venden (Colombia) y "Publicar mi finca".
  const wantsListings = /(comprar|compro|quien vende|donde compro|fincas que venden|vender mi|vendo mi|publicar mi finca|buy |buy$|who sells|sell my|farms selling)/.test(text);
  const wantsReport = /\b(reportar|reporto|avisar|report)\b/.test(text) && (Boolean(hazardKind) || /(evento|emergencia|event|emergency)/.test(text));
  // Informe agroclimático (imprimible y CSV): "genera un informe", "exportar los datos", "agroclimatic report".
  const wantsAgroReport =
    /(informe|agroclimatic|exportar|export|descargar (los )?datos|download (the )?data|\bcsv\b|\bpdf\b)/.test(text) ||
    (/\breport\b/.test(text) && !hazardKind && !/(emergenc|event)/.test(text));
  const wantsEvents =
    !wantsAgroReport &&
    !wantsReport &&
    (/(emergencia|evento|ungrd|desastre|emergenc|event|disaster)/.test(text) || (Boolean(hazardKind) && hazardKind !== 'drought'));
  // Fecha pedida en la pregunta, o la que la persona ya está revisando en la app.
  const askedWhen = detectWhen(text);
  const when = askedWhen ?? req.view.when ?? null;
  const sel = when ? parseTimeParam(when) : null;
  const period = sel ? periodOf(sel) : null;
  const periodName = sel ? periodLabel({ kind: 'month', ym: period!.start.slice(0, 7) }, l) : null;

  // Lugar: conocido, "mi zona" (ubicación de la persona o lo que mira) o un nombre suelto para geocodificar en el cliente.
  let place: { name: string; lon: number; lat: number; zoom: number; demo?: string } | null = null;
  let labelOnly: string | null = null;
  if (known) place = { name: known.name[l], lon: known.lon, lat: known.lat, zoom: known.zoom, demo: known.demo };
  else if (mine) {
    const u = req.userLocation;
    const [lon, lat] = u ? [u.lon, u.lat] : req.view.center;
    place = { name: u?.city ?? tr(l, 'tu zona', 'your area'), lon, lat, zoom: u?.accuracy === 'precise' ? 11 : 7 };
  } else {
    const m = req.message.match(/\b(?:en|in|de|of)\s+([A-ZÁÉÍÓÚÑ][\p{L}\s.'-]{2,40})/u);
    if (m) labelOnly = m[1]!.trim().replace(/[?.!,]+$/, '');
  }

  const actions: unknown[] = [];
  const sources: NonNullable<AgentResponse['sources']> = [];
  if (askedWhen && sel) actions.push({ type: 'setTime', when: askedWhen });
  if (place) actions.push({ type: 'flyTo', lat: place.lat, lon: place.lon, zoom: place.zoom, label: place.name });
  else if (labelOnly) actions.push({ type: 'flyTo', label: labelOnly, zoom: 7 });
  if (wantsRisk) {
    // Sin lugar: se encuadra Colombia para que se vean las zonas.
    if (!place && !labelOnly) actions.push({ type: 'flyTo', lat: 4.6, lon: -74.3, zoom: 4.8, label: 'Colombia' });
    actions.push({ type: 'setLayer', layerId: 'risk', risk: riskKindOf(text) });
    sources.push({ dataset: 'Google Earth Engine: SMAP L4, GPM IMERG, MODIS (NDVI, LST, ET, MNDWI), GRACE-FO, SRTM' });
  } else if (layer) {
    actions.push({ type: 'setLayer', layerId: layer.layer });
    sources.push({ dataset: layer.dataset, url: 'https://earthdata.nasa.gov/gibs' });
  }

  // Datos de la región para la respuesta (mismos números que el drawer).
  const at = place ?? { lon: req.view.center[0], lat: req.view.center[1], name: labelOnly ?? tr(l, 'esta zona', 'this area'), zoom: 6 };
  const region = buildMockRegion(
    {
      lat: at.lat,
      lon: at.lon,
      demoId: place?.demo,
      name: at.name,
      locale: l,
      period: period && periodName ? { start: period.start, end: period.end, partial: period.partial, label: periodName } : undefined,
    },
    null,
  );
  const card = (id: string) => region.cards.find((c) => c.id === id)!;
  // La radio abre la región ella misma al final del boletín.
  if (place && !wantsRadio) actions.push({ type: 'openRegion', lat: place.lat, lon: place.lon, name: place.name });

  let reply: string;
  if (wantsRadio && env.radioAudioOnly) {
    // Solo audios grabados: la radio no lee los datos del lugar, así que no se promete el boletín.
    actions.push({ type: 'playRadio' });
    reply = tr(
      l,
      '**Pongo la radio del campo.** Suena un mensaje grabado por el equipo de Field Shift. Puedes pausar cuando quieras en el reproductor.\n\nSi quieres los datos de una zona (lluvia, suelo, verdor), pregúntame por ella.',
      '**Playing the field radio.** You will hear a message recorded by the Field Shift team. You can pause any time in the player.\n\nIf you want the data of an area (rain, soil, greenness), ask me about it.',
    );
  } else if (wantsRadio) {
    actions.push(place ? { type: 'playRadio', lat: place.lat, lon: place.lon, name: place.name } : { type: 'playRadio' });
    reply = tr(
      l,
      `**Pongo en la radio el boletín de ${at.name}.** Vas a escuchar la lluvia, el suelo, el verdor de las plantas, los eventos cercanos y, en Colombia, el riesgo del terreno y los precios, con datos de la NASA. El mapa se mueve con lo que dice el locutor; si lo tocas, deja de moverlo.\n\nPuedes pausar cuando quieras y leer la transcripción en el reproductor.`,
      `**Playing the ${at.name} bulletin on the radio.** You will hear the rain, the soil, crop greenness, nearby events and, in Colombia, land risk and prices, with NASA data. The map follows what the host says; if you touch it, it stops moving.\n\nYou can pause any time and read the transcript in the player.`,
    );
    sources.push({ dataset: 'NASA POWER', url: 'https://power.larc.nasa.gov/' });
  } else if (wantsRisk) {
    const kind = RISK_LABEL[riskKindOf(text)];
    const outside = place && !inColombia(place.lon, place.lat);
    const opened = place && !outside ? tr(l, ` y abrí **${place.name}**`, ` and opened **${place.name}**`) : '';
    reply = tr(
      l,
      `**Te muestro las zonas de riesgo${kind.es} en el globo**${opened}. Cada municipio tiene un nivel (bajo, medio o alto) que combina datos NASA calculados en Google Earth Engine: humedad del suelo (SMAP), lluvia (GPM), calor y verdor (MODIS), agua subterránea (GRACE) y relieve (SRTM). El rayado marca el riesgo alto y los puntos el medio.\n\nToca un municipio para ver **cómo ha cambiado su terreno**: el estado inicial (2016–2018), el final (2023–2025), las flechas de cambio entre estados (cadena de Markov) y hacia dónde iría si todo sigue igual.${outside ? '\n\n**Por ahora las zonas de riesgo solo están en Colombia.**' : ''}\n\nEs el promedio del municipio, no de tu finca: confírmalo en el terreno.`,
      `**Showing risk zones${kind.en} on the globe**${opened}. Each municipality gets a level (low, medium or high) that combines NASA data computed in Google Earth Engine: soil moisture (SMAP), rain (GPM), heat and greenness (MODIS), groundwater (GRACE) and relief (SRTM). Hatching marks high risk and dots mark medium.\n\nTap a municipality to see **how its land has changed**: the initial state (2016–2018), the final state (2023–2025), the arrows between states (Markov chain) and where it is heading if nothing changes.${outside ? '\n\n**For now, risk zones are only available in Colombia.**' : ''}\n\nIt is the municipality average, not your farm: check it on the ground.`,
    );
  } else if (wantsAgroReport) {
    actions.push({ type: 'agroReport', lat: place?.lat, lon: place?.lon, name: place?.name, when: askedWhen ?? undefined });
    const when = periodName ?? tr(l, 'los últimos 30 días', 'the last 30 days');
    reply = tr(
      l,
      `**Preparé el informe agroclimático de ${at.name} para ${when}.** Tiene la lluvia y la temperatura de cada día contra lo normal (NASA POWER), los eventos del clima, las emergencias registradas cerca (UNGRD, NASA EONET y la comunidad) y qué vigilar.\n\nÁbrelo con el botón de abajo: puedes **imprimirlo o guardarlo en PDF** y **descargar los datos en CSV**.`,
      `**I prepared the agroclimatic report for ${at.name} for ${when}.** It has daily rain and temperature against normal (NASA POWER), weather events, emergencies recorded nearby (UNGRD, NASA EONET and the community) and what to watch.\n\nOpen it with the button below: you can **print it or save it as PDF** and **download the data as CSV**.`,
    );
    sources.push({ dataset: 'NASA POWER', url: 'https://power.larc.nasa.gov/' });
  } else if (wantsListings) {
    actions.push({ type: 'showListings', on: true });
    reply = tr(
      l,
      '**Te muestro en el globo las fincas que venden** su cosecha en Colombia (puntos verdes; los huecos son ejemplos de la demo). Toca una para ver qué ofrece y **escribirle por WhatsApp**.\n\n¿Quieres vender lo tuyo? Marca tu finca con **Mi finca** y toca **Publicar mi finca**: es gratis y solo mostramos tu municipio.',
      '**I am showing farms that sell** their harvest in Colombia on the globe (green dots; hollow ones are demo examples). Tap one to see what it offers and **message them on WhatsApp**.\n\nWant to sell yours? Mark your farm with **My farm** and tap **Publish my farm**: it is free and we only show your municipality.',
    );
  } else if (wantsReport) {
    actions.push({ type: 'showEvents', on: true }, { type: 'reportEvent', kind: hazardKind, lat: place?.lat, lon: place?.lon });
    const what = hazardKind ? HAZARD_LABEL[hazardKind] : { es: 'el evento', en: 'the event' };
    reply = tr(
      l,
      `**Te abrí el formulario para reportar: ${what.es}.** Revisa el punto en el mapa, marca qué afectó y envíalo. Aparecerá como _sin verificar_ hasta que una entidad lo confirme.\n\n**Si hay personas en peligro, llama ya al 123** (Colombia) o a la línea de emergencias de tu país.`,
      `**I opened the form to report: ${what.en}.** Check the point on the map, mark what it affected and send it. It will show as _not verified_ until an agency confirms it.\n\n**If people are in danger, call 123 now** (Colombia) or your local emergency number.`,
    );
  } else if (wantsEvents) {
    actions.push({ type: 'showEvents', on: true, kind: hazardKind });
    const which = hazardKind ? HAZARD_LABEL[hazardKind] : null;
    const when = periodName ?? tr(l, 'los últimos 90 días', 'the last 90 days');
    reply = tr(
      l,
      `Te muestro en el globo los eventos${which ? ` de tipo **${which.es}**` : ''} de **${when}**: los de **NASA EONET** (satélites), el registro oficial de la **UNGRD** en Colombia y los **reportes de la comunidad** (sin verificar, en anillo).\n\nToca un punto para ver la fecha, el lugar y la afectación. La UNGRD publica con retraso (hasta diciembre de 2025): para verla, pídeme un mes, por ejemplo "deslizamientos en mayo de 2025".${place ? ' Abrí la región: ahí está el historial del municipio.' : ''}`,
      `I am showing${which ? ` **${which.en}**` : ''} events on the globe for **${when}**: **NASA EONET** (satellites), the official **UNGRD** record for Colombia and **community reports** (not verified, shown as rings).\n\nTap a dot to see the date, place and impact. UNGRD publishes with a delay (up to December 2025): ask me for a month, for example "landslides in May 2025".${place ? ' I opened the region: it has the municipality history.' : ''}`,
    );
    sources.push({ dataset: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/' }, { dataset: 'UNGRD · datos.gov.co', url: 'https://www.datos.gov.co/d/wwkg-r6te' });
  } else if ((wantsRotation || wantsMissing) && missing.length) {
    // Datos insuficientes: primero pedir lo que solo sabe el agricultor (máx. 3 preguntas) y abrir las preguntas rápidas.
    actions.push({ type: 'askForData', need: missing[0] });
    const questions = missing.slice(0, 3).map((n) => `- ${ASK[n][l]}`).join('\n');
    const general = wantsRotation
      ? tr(
          l,
          '\n\nMientras tanto, en general: si viene sequía, conviene un cultivo tolerante (sorgo, caupí), una **leguminosa** que deje nitrógeno y **el suelo cubierto**.',
          '\n\nMeanwhile, in general: if drought is coming, choose a tolerant crop (sorghum, cowpea), a **legume** that leaves nitrogen and **keep the soil covered**.',
        )
      : '';
    reply = tr(
      l,
      `**Para recomendarte con confianza me faltan datos de tu finca** que los satélites no ven:\n\n${questions}\n\nTe abrí las preguntas rápidas en el análisis: son solo unos toques.${general}`,
      `**To give you confident advice I need some farm data** that satellites can’t see:\n\n${questions}\n\nI opened the quick questions in the analysis: just a few taps.${general}`,
    );
    sources.push({ dataset: 'NASA POWER' });
  } else if (wantsMissing) {
    if (req.view.fieldId) actions.push({ type: 'showStrategies', fieldId: req.view.fieldId });
    reply = req.view.fieldId
      ? tr(
          l,
          '**Tu análisis ya tiene lo que necesitamos de tu finca.** Te abrí las opciones de rotación para compararlas.',
          '**Your analysis already has what we need from your farm.** I opened the rotation options to compare them.',
        )
      : tr(
          l,
          'Primero marca tu finca con el botón **Mi finca** y te digo qué datos le faltan al análisis.',
          'First mark your farm with the **My farm** button and I will tell you what data the analysis is missing.',
        );
  } else if (wantsRotation) {
    if (req.view.fieldId) actions.push({ type: 'showStrategies', fieldId: req.view.fieldId });
    reply = tr(
      l,
      `**Si viene sequía, conviene una rotación que cuide el agua.**\n\n- Cultivos de ciclo corto y tolerantes: **sorgo, mijo, caupí (frijol de vaca)** o **garbanzo**.\n- Una **leguminosa** en la rotación deja nitrógeno y ahorra fertilizante.\n- **Mantén el suelo cubierto** (rastrojo o cobertura) para que la poca lluvia no se evapore.\n\n${req.view.fieldId ? 'Te abrí las opciones de rotación de tu finca para compararlas.' : 'Marca tu finca con el botón **Mi finca** y te muestro opciones comparadas con lo que haces hoy.'}`,
      `**If drought is coming, choose a rotation that saves water.**\n\n- Short-cycle, tolerant crops: **sorghum, millet, cowpea** or **chickpea**.\n- A **legume** in the rotation leaves nitrogen and saves fertilizer.\n- **Keep the soil covered** (residue or a cover crop) so scarce rain does not evaporate.\n\n${req.view.fieldId ? 'I opened your farm rotation options to compare them.' : 'Mark your farm with the **My farm** button and I will show options compared with what you do today.'}`,
    );
    sources.push({ dataset: 'SMAP L4 Root Zone Soil Moisture' }, { dataset: 'NASA POWER' });
  } else if (layer) {
    const c =
      layer.layer === 'soil-moisture'
        ? card('soil-moisture')
        : layer.layer === 'rain'
          ? card('rain')
          : layer.layer === 'ndvi'
            ? card('ndvi')
            : layer.layer === 'groundwater'
              ? card('groundwater')
              : layer.layer === 'relief'
                ? card('relief')
                : layer.layer === 'evap'
                  ? card('et')
                  : card('heat');
    const value = c.value != null ? ` (${c.value} ${c.unit})` : '';
    const inPeriod = periodName ? tr(l, ` en ${periodName}`, ` in ${periodName}`) : '';
    const timeNote = askedWhen && periodName ? tr(l, ` Puse la app en **${periodName}**: el mapa y los paneles muestran esa fecha.`, ` I set the app to **${periodName}**: the map and panels show that date.`) : '';
    reply = tr(
      l,
      `**${c.headline}** en ${at.name}${inPeriod}${value}.${timeNote}\n\nTe muestro la capa de **${layer.label.es}** en el globo${place ? ' y abrí los datos de la región' : ''}. ${layer.layer === 'rain' ? (periodName ? `Es lo que midieron los satélites en ${periodName}, comparado con lo normal de ese mes. Abre tu finca para ver los eventos día a día.` : 'Ojo: no es un pronóstico, es lo que midieron los satélites en el último mes comparado con lo normal.') : 'Recuerda que un píxel satelital promedia un área grande: úsalo como tendencia.'}`,
      `**${c.headline}** in ${at.name}${inPeriod}${value}.${timeNote}\n\nI am showing the **${layer.label.en}** layer on the globe${place ? ' and opened the region data' : ''}. ${layer.layer === 'rain' ? (periodName ? `This is what satellites measured in ${periodName}, compared with that month's normal. Open your farm to see the events day by day.` : 'Note: this is not a forecast, it is what satellites measured last month compared with normal.') : 'Remember a satellite pixel averages a large area: use it as a trend.'}`,
    );
  } else if (askedWhen && periodName && !place && !labelOnly) {
    reply = tr(
      l,
      `Puse la app en **${periodName}**. Toca una región del globo o abre tu finca para ver cómo estuvieron la lluvia y el calor en esa fecha, con los eventos reconstruidos día a día.`,
      `I set the app to **${periodName}**. Tap a region on the globe or open your farm to see how rain and heat were on that date, with the events reconstructed day by day.`,
    );
  } else if (place || labelOnly) {
    reply = tr(
      l,
      `Te llevo a **${at.name}**. ${region.alerts[0] ?? ''}\n\nPuedes preguntarme por la **lluvia**, la **humedad del suelo** o el **verdor** de la zona.`,
      `Taking you to **${at.name}**. ${region.alerts[0] ?? ''}\n\nYou can ask me about **rain**, **soil moisture** or **greenness** in the area.`,
    );
  } else {
    reply = tr(
      l,
      'Puedo mostrarte datos de la NASA sobre cualquier zona: **lluvia**, **humedad del suelo**, **verdor de los cultivos**, **calor** o **agua subterránea**. Prueba con "Muéstrame la humedad del suelo en el Punjab".',
      'I can show you NASA data for any area: **rain**, **soil moisture**, **crop greenness**, **heat** or **groundwater**. Try "Show me soil moisture in Punjab".',
    );
  }

  return {
    // Modo sencillo (perfil): solo el primer párrafo, que ya trae el dato principal.
    reply: `${req.profile?.mode === 'lite' ? reply.split('\n\n')[0] : reply}\n\n_${tr(l, 'Respuesta de prueba (agente local sin n8n).', 'Test answer (local agent without n8n).')}_`,
    actions,
    sources: sources.length ? sources : undefined,
    suggestions: [
      tr(l, '¿Cómo estará la lluvia en mi zona este mes?', 'How will rain be in my area this month?'),
      tr(l, 'Muéstrame la humedad del suelo en el Valle del Cauca', 'Show me soil moisture in Valle del Cauca'),
      tr(l, '¿Qué rotación me conviene si hay sequía?', 'Which rotation suits me if there is drought?'),
    ],
  };
}
