/**
 * Agente del campo con Claude (Anthropic API). Solo servidor: lo usa /api/agent cuando no hay webhook de n8n
 * y existe ANTHROPIC_API_KEY (en .env.local, nunca con prefijo NEXT_PUBLIC_).
 *
 * - Tool runner del SDK con tres herramientas propias: datos de región (NASA POWER real + resto simulado y marcado),
 *   eventos y emergencias (UNGRD + NASA EONET + comunidad) y geocodificación de lugares.
 * - Salida estructurada (JSON schema) con el mismo contrato que n8n: reply, actions, sources, suggestions.
 * - claude-opus-5-5 con esfuerzo "low" (chat: respuestas rápidas) y fallback del servidor ante rechazos.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat, betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { DEMO_FARMS } from '@/features/field/demoFarms';
import { LAYER_IDS } from '@/features/layers/ids';
import { eventWindow } from '@/features/events/window';
import { AgentResponse, DATA_NEEDS, HAZARD_KINDS, type AgentRequest, type HazardEvent } from '@/lib/api/contract';
import { buildMockRegion } from '@/mocks/region';
import { parseTimeParam, periodLabel, periodOf } from '@/features/time/period';
import { eventHistory } from './events';
import { powerPeriod, powerRecent } from './powerRecent';

const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
/** Lee ANTHROPIC_API_KEY del entorno del servidor. Timeout por intento: 25 s (el proxy corta a 30 s). */
const getClient = () => (client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 }));

/** AGENT_FORCE_MOCK=true (p. ej. en los e2e) desactiva Claude para no gastar la clave ni depender de la red. */
export const claudeAgentEnabled = () =>
  process.env.AGENT_FORCE_MOCK !== 'true' && Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const SYSTEM = `You are the field assistant of Field Shift, a web app that helps farmers explore crop rotations using NASA Earth observation data on an interactive 3D globe.

Audience: farmers, many with little experience with apps. Write short, plain sentences. Explain any technical term in a few words (for example NDVI = how green the plants are). Answer in the language given by "locale" in the context ("es" = Spanish, "en" = English).

User profile (profile in the context, from the start-up questions and Settings; it may be missing):
- role "technician" (agronomist, extension worker): you may use technical terms, mission names, units and resolution, still in clear sentences. role "farmer" or no role: plain words as above.
- mode "lite" (simple view): at most about 60 words, one main idea, lists of 3 items or fewer, no tables, the most important fact first.
- narrator true: your reply will be read aloud by the phone's voice. Write it to be heard: no tables, no symbols or emojis, no abbreviations (write "millimetres", not "mm"), and say numbers simply.

Data rules:
- Before giving any number or condition for a place, call get_region_data for that place. Never invent values.
- To turn a place name into coordinates, call geocode. For "my area", "my farm", "here" use userLocation from the context; for "this area" or "what I am looking at" use view.center.
- Cite the source and the date of each number you use (for example "SMAP, 8 nov 2026"). If a card is marked simulated, say it is a demo value.
- Rain values are what satellites measured recently, not a forecast. Say so when the user asks about the future.
- Past dates ("time machine"): if the user asks how a past month or day was (for example "how did it rain in May?"), call get_region_data with month="YYYY-MM" (the most recent such month that has already happened if no year is given) and add a setTime action. view.when (if present) is the past date the user is already reviewing: answer about that period unless they ask about another one. Data is daily since 1981 and about 3 days behind; future dates have no data.
- When you give advice, keep it practical and remind that important decisions should be checked with a local agricultural advisor.
- Missing farm data: view.missingData lists what the farm analysis still lacks and satellites cannot see (current-rotation = what they plant today, soil-type = sandy/loamy/clay/silty, irrigation = whether they can irrigate, drainage = whether the plot stays waterlogged after heavy rain, soil-test = lab pH and organic matter). When the user asks for a recommendation, a rotation, what to plant or an analysis of their farm and view.missingData is not empty: first ask for the 1 to 3 most important ones in plain words (in that list order), say in one sentence why they change the advice, add an askForData action with the first one, and give only general advice until they answer. Never assume those values. If the user answers one in the chat, thank them and tell them to tap that answer in the quick questions so the analysis uses it.

Globe actions (the app runs them in order: flights first, then layers, then panels):
- flyTo {lat, lon, zoom, label}: zoom 5–8 for a region, 11–14 for a farm or town. Use it when the user asks to see or go somewhere, or asks about a specific place.
- setLayer {layerId, date?}: when the user asks about a variable. Layers: ndvi (plant greenness, MODIS), soil-moisture (root-zone soil moisture, SMAP), rain (daily rain, GPM IMERG), lst-day (daytime ground heat, MODIS), lst-night (night cold and frost risk, MODIS), evap (water the land loses, MERRA-2 model), groundwater (GRACE/GRACE-FO, data up to 2022), relief (slopes, SRTM).
- openRegion {lat, lon, name}: opens the panel with all NASA sensor cards for a place. Use it for questions about conditions in a place.
- clearLayers: only when the user asks to remove layers.
- showStrategies: only for crop rotation questions and only if view.fieldId exists; otherwise tell the user to mark the farm with the "Mi finca" / "My farm" button.
- askForData {need?}: opens the quick questions of the farm analysis at that need (one of view.missingData). Only if view.fieldId exists. Do not combine it with openRegion or showStrategies (they open on the same side of the screen).
- playRadio: only if the user asks for the radio.
- setTime {when}: when = "YYYY-MM" (a month) or "YYYY-MM-DD" (a day) moves the whole app to that past date (map layers, region panel, farm panel); when = null goes back to today. Put it before setLayer.
- showEvents {on?, kind?}: shows events and emergencies on the globe (NASA EONET worldwide, the official UNGRD record for Colombia and community reports), optionally only one kind (landslide, flood, storm, wildfire, drought, frost, erosion, earthquake, volcano, other). It shows the period of view.when, or the last 90 days.
- reportEvent {kind?, lat?, lon?}: opens the form so the user can report an event (landslide, flood, hail…). It only opens the form: the user reviews and sends it. Use it when the user wants to report or warn about something that happened.
- agroReport {lat?, lon?, name?, when?}: prepares a printable agroclimatic report for a place (daily rain and temperature against normal from NASA POWER, weather events, nearby emergencies, what to watch, daily data table) that the user can print, save as PDF or download as CSV. when = "YYYY-MM" for a month; omit it for the month in view.when or the last 30 days. Without lat/lon it uses the place on screen (after any flyTo). Use it when the user asks for a report, an "informe", to export or download data, a PDF or a CSV (for example a local government office). The app shows a button to open it; tell the user what it contains.
Use no actions for general questions that are not about a place.

Events and emergencies:
- For questions about landslides, floods, fires, storms, emergencies or disasters in a place, call get_events (with month="YYYY-MM" for a past month) and add showEvents. UNGRD data is official but published with a delay (latest data: see the tool result) and located at the center of the municipality. Community reports are not verified: always say so.
- If the user reports that people are in danger, tell them first to call 123 (Colombia) or their local emergency number. This app does not alert emergency services.

Output: "reply" is short markdown (at most about 120 words, no HTML). "sources" lists the datasets you used with their dates. "suggestions" has 2 or 3 short follow-up questions in the user's language.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions', 'sources', 'suggestions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'flyTo',
              'fitBounds',
              'setLayer',
              'clearLayers',
              'openRegion',
              'showStrategies',
              'playRadio',
              'setTime',
              'askForData',
              'showEvents',
              'reportEvent',
              'agroReport',
            ],
          },
          need: { type: 'string', enum: [...DATA_NEEDS] },
          on: { type: 'boolean' },
          kind: { type: 'string', enum: [...HAZARD_KINDS] },
          lat: { type: 'number' },
          lon: { type: 'number' },
          zoom: { type: 'number' },
          label: { type: 'string' },
          name: { type: 'string' },
          layerId: { type: 'string', enum: [...LAYER_IDS] },
          date: { type: 'string' },
          bbox: { type: 'array', items: { type: 'number' } },
          fieldId: { type: 'string' },
          stationId: { type: 'string' },
          when: { type: ['string', 'null'] },
        },
      },
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dataset'],
        properties: { dataset: { type: 'string' }, date: { type: 'string' } },
      },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Geocodificación del lado del servidor: MapTiler si hay clave; si no, Nominatim con un User-Agent genérico. */
async function geocode(place: string, locale: string) {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  if (key) {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(place)}.json?key=${encodeURIComponent(key)}&language=${locale}&limit=3`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { features?: { place_name: string; center: [number, number] }[] };
    return (j.features ?? []).map((f) => ({ name: f.place_name, lon: f.center[0], lat: f.center[1] }));
  }
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&accept-language=${locale}&q=${encodeURIComponent(place)}`,
    { headers: { 'User-Agent': 'FieldShift/0.1 (NASA Space Apps demo)' }, signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return j.map((r) => ({ name: r.display_name.split(',').slice(0, 3).join(','), lat: Number(r.lat), lon: Number(r.lon) }));
}

function buildTools(locale: 'es' | 'en') {
  const getRegionData = betaTool({
    name: 'get_region_data',
    description:
      'NASA sensor summary for a place: soil moisture (SMAP), rain in the last 7 and 30 days vs normal and daily max temperature (real NASA POWER data when available), greenness (MODIS NDVI), water loss, groundwater trend (GRACE-FO) and slope (SRTM). With month="YYYY-MM" it returns that past month instead (rain total vs normal and temperatures for that month). Cards with simulated=true are demo values. Call it before stating any condition of a place.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number', description: 'Latitude in degrees (-90 to 90)' },
        lon: { type: 'number', description: 'Longitude in degrees (-180 to 180)' },
        name: { type: 'string', description: 'Place name to show the farmer' },
        demoId: { type: 'string', enum: DEMO_FARMS.map((d) => d.id), description: 'Only for the app demo regions' },
        month: { type: 'string', description: 'Past month to review, "YYYY-MM" (time machine). Omit for the most recent data.' },
      },
    },
    run: async ({ lat, lon, name, demoId, month }) => {
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'Invalid coordinates.';
      const sel = month ? parseTimeParam(month) : null;
      if (month && !sel) return 'No data for that month (future, too recent or before 1981).';
      const period = sel ? periodOf(sel) : null;
      const power = period ? await powerPeriod(lat, lon, period.start, period.end) : await powerRecent(lat, lon);
      const r = buildMockRegion(
        {
          lat,
          lon,
          name: name ?? null,
          demoId,
          locale,
          period: sel && period ? { start: period.start, end: period.end, partial: period.partial, label: periodLabel(sel, locale) } : undefined,
        },
        power,
      );
      return JSON.stringify({
        name: r.name,
        cards: r.cards.map((c) => ({
          id: c.id,
          source: c.source,
          mission: c.mission,
          date: c.date,
          headline: c.headline,
          value: c.value,
          unit: c.unit,
          comparison: c.comparison,
          status: c.status,
          simulated: Boolean(c.simulated),
        })),
        alerts: r.alerts,
      });
    },
  });

  const geocodeTool = betaTool({
    name: 'geocode',
    description: 'Find the coordinates of a place name (town, municipality, region or country). Returns up to 3 matches.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['place'],
      properties: { place: { type: 'string', description: 'Place name, e.g. "Valle del Cauca, Colombia"' } },
    },
    run: async ({ place }) => {
      const hits = await geocode(place, locale).catch(() => []);
      return hits.length ? JSON.stringify(hits) : 'No matches found.';
    },
  });

  const getEvents = betaTool({
    name: 'get_events',
    description:
      'Events and emergencies near a place: the official UNGRD history of the nearest Colombian municipality (counts by kind since 2019 and the latest emergencies, with people, homes, roads and hectares affected) and NASA EONET plus community events within 50 km in the period (last 90 days, or the given month). Community reports are not verified.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number', description: 'Latitude in degrees (-90 to 90)' },
        lon: { type: 'number', description: 'Longitude in degrees (-180 to 180)' },
        month: { type: 'string', description: 'Past month "YYYY-MM" for nearby events. Omit for the last 90 days.' },
      },
    },
    run: async ({ lat, lon, month }) => {
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'Invalid coordinates.';
      const sel = month ? parseTimeParam(month) : null;
      if (month && !sel) return 'No data for that month (future, too recent or before 1981).';
      const w = eventWindow(sel);
      const h = await eventHistory(lat, lon, w.from, w.to);
      // Sin el texto libre de los reportes: es contenido de terceros sin verificar.
      const brief = (e: HazardEvent) => ({
        date: e.date,
        kind: e.kind,
        source: e.source,
        verified: e.verified,
        place: e.place,
        impact: e.impact ?? undefined,
        reportedImpacts: e.impacts,
        sample: e.sample || undefined,
      });
      return JSON.stringify({
        period: w,
        ungrd: h.place
          ? { municipality: `${h.place.name}, ${h.place.dept}`, years: h.years, total: h.total, byKind: h.byKind, latest: h.recent.map(brief) }
          : h.status === 'outside'
            ? 'Outside Colombia: no UNGRD record.'
            : 'UNGRD record unavailable right now.',
        nearby: h.nearby.map(brief),
      });
    },
  });

  return [getRegionData, geocodeTool, getEvents];
}

export async function runClaudeAgent(req: AgentRequest): Promise<AgentResponse> {
  const context = {
    locale: req.locale,
    userLocation: req.userLocation,
    view: req.view,
    profile: req.profile,
  };
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam),
    {
      role: 'user',
      content: `<context>\n${JSON.stringify(context)}\n</context>\n\n${req.message}`,
    },
  ];

  const final = await getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA) },
    tools: buildTools(req.locale),
    max_iterations: 5,
    messages,
  });

  if (final.stop_reason === 'refusal') {
    return {
      reply:
        req.locale === 'en'
          ? 'I can’t help with that request. Ask me about rain, soil moisture or crops in an area.'
          : 'No puedo ayudar con esa solicitud. Pregúntame por la lluvia, la humedad del suelo o los cultivos de una zona.',
      actions: [],
    };
  }

  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = AgentResponse.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('claude_out_of_contract');
  return parsed.data;
}
