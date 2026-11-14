/**
 * Reportes de la comunidad (mock). Viven en la memoria del servidor: se pierden al reiniciar y no se comparten
 * entre instancias. El backend real guardará y moderará estos reportes (contrato en docs/api-contract.md).
 * No se guarda nada de la persona: ni nombre, ni teléfono, ni correo, ni IP (solo un contador temporal anti-abuso).
 */
import type { CommunityReportInput, HazardEvent } from '@/lib/api/contract';
import { redact } from '@/server/text';
import { nearestMunicipio } from './divipola';

export { redact };

const MAX_REPORTS = 500;
const DAY = 86_400_000;

const g = globalThis as typeof globalThis & { __fieldShiftReports?: HazardEvent[]; __fieldShiftRate?: Map<string, number[]> };

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Ejemplos para la demo, con fechas relativas a hoy. Se marcan como ejemplo en la interfaz. */
function seeds(now = Date.now()): HazardEvent[] {
  const base = { source: 'community' as const, approx: true, url: null, verified: false, impact: null, magnitude: null, sample: true };
  return [
    {
      ...base,
      id: 'community-sample-1',
      kind: 'landslide',
      title: 'Deslizamiento',
      date: isoDay(now - 2 * DAY),
      lat: 4.612,
      lon: -75.598,
      place: 'Salento, Quindío',
      note: 'Bajó tierra sobre la vía a la vereda después del aguacero de la noche. El cafetal de abajo quedó con barro.',
      impacts: ['road', 'crops'],
    },
    {
      ...base,
      id: 'community-sample-2',
      kind: 'flood',
      title: 'Creciente',
      date: isoDay(now - 5 * DAY),
      lat: 4.519,
      lon: -75.643,
      place: 'Calarcá, Quindío',
      note: 'La quebrada se salió y tapó la bocatoma del acueducto veredal.',
      impacts: ['water'],
    },
    {
      ...base,
      id: 'community-sample-3',
      kind: 'drought',
      title: 'Sequía',
      date: isoDay(now - 9 * DAY),
      lat: -33.912,
      lon: -60.571,
      place: 'Pergamino, Buenos Aires',
      note: 'Tres semanas sin lluvia: el maíz temprano está enrollando las hojas.',
      impacts: ['crops'],
    },
  ];
}

function store(): HazardEvent[] {
  g.__fieldShiftReports ??= seeds();
  return g.__fieldShiftReports;
}

/** Reportes entre dos fechas (YYYY-MM-DD). */
export function communityEvents(from: string, to: string): HazardEvent[] {
  return store().filter((r) => r.date >= from && r.date <= to);
}

const KIND_TITLE: Record<HazardEvent['kind'], string> = {
  landslide: 'Deslizamiento',
  flood: 'Inundación o creciente',
  storm: 'Vendaval, granizo o tormenta',
  wildfire: 'Incendio',
  drought: 'Sequía',
  frost: 'Helada',
  erosion: 'Erosión',
  earthquake: 'Sismo',
  volcano: 'Volcán',
  other: 'Otro evento',
};

export type AddResult = { ok: true; report: HazardEvent } | { ok: false; reason: 'date' | 'rate' };

/** Valida la fecha, limita el ritmo por cliente y guarda el reporte (redondeado a ~100 m). */
export function addReport(input: CommunityReportInput, clientKey: string, now = Date.now()): AddResult {
  const today = isoDay(now + DAY); // margen por zonas horarias
  if (input.date > today || input.date < isoDay(now - 60 * DAY)) return { ok: false, reason: 'date' };

  const rate = (g.__fieldShiftRate ??= new Map<string, number[]>());
  const recent = (rate.get(clientKey) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 5) return { ok: false, reason: 'rate' };
  rate.set(clientKey, [...recent, now]);
  if (rate.size > 5000) rate.clear();

  const lat = Math.round(input.lat * 1000) / 1000;
  const lon = Math.round(input.lon * 1000) / 1000;
  const m = nearestMunicipio(lat, lon);
  const note = input.note ? redact(input.note).slice(0, 280) : '';
  const place = m ? `${m.name}, ${m.dept}` : input.place ? redact(input.place).slice(0, 120) : null;
  const report: HazardEvent = {
    id: `community-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'community',
    kind: input.kind,
    title: KIND_TITLE[input.kind],
    date: input.date,
    lat,
    lon,
    place,
    approx: true,
    url: null,
    verified: false,
    impact: null,
    magnitude: null,
    note: note || null,
    impacts: [...new Set(input.impacts)],
  };
  const list = store();
  list.unshift(report);
  if (list.length > MAX_REPORTS) list.length = MAX_REPORTS;
  return { ok: true, report };
}
