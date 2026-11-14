/**
 * Emergencias reportadas a la UNGRD (Unidad Nacional para la Gestión del Riesgo de Desastres, Colombia),
 * datos abiertos en datos.gov.co (API SODA, sin clave). Un conjunto por periodo y con columnas que cambian de nombre.
 * No traen coordenadas: cada emergencia se ubica en el centro de su municipio (código DIVIPOLA).
 */
import type { HazardEvent, HazardKind } from '@/lib/api/contract';
import { soda } from '@/server/datosGov';
import { municipio, resolveMunicipio } from './divipola';
import { normalizeName, ungrdKind } from './kinds';

type Fields = {
  code: string;
  deaths: string;
  injured: string;
  missing: string;
  people: string;
  families: string;
  homesDestroyed: string;
  homesDamaged: string;
  roads: string;
  hectares: string;
};

const OLD: Omit<Fields, 'code'> = {
  deaths: 'fallecidos',
  injured: 'heridos',
  missing: 'desaparecidos',
  people: 'personas',
  families: 'familias',
  homesDestroyed: 'viviendas_destruidas',
  homesDamaged: 'viviendas_averiadas',
  roads: 'vias_averiadas',
  hectares: 'hectareas',
};

export const UNGRD_DATASETS: { id: string; from: number; to: number; f: Fields }[] = [
  { id: 'wwkg-r6te', from: 2019, to: 2022, f: { code: 'divipola', ...OLD } },
  { id: 'rgre-6ak4', from: 2023, to: 2024, f: { code: 'codificaci_n_segun_divipola', ...OLD } },
  {
    id: '2343-nuqp',
    from: 2025,
    to: 9999,
    f: {
      code: 'codificaci_n_segun_divipola',
      deaths: 'muertos',
      injured: 'heridos',
      missing: 'desapa',
      people: 'personas',
      families: 'familias',
      homesDestroyed: 'viv_destru',
      homesDamaged: 'viv_aver',
      roads: 'vias',
      hectares: 'hectareas',
    },
  },
];

export const UNGRD_FIRST_YEAR = 2019;
export const UNGRD_PAGE = 'https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Emergencias-UNGRD-/wwkg-r6te';

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'o']);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

type Row = Record<string, string | undefined>;

function toEvent(row: Row, ds: (typeof UNGRD_DATASETS)[number]): HazardEvent | null {
  const kind = ungrdKind(row.evento ?? '');
  if (!kind) return null;
  const m = resolveMunicipio(row[ds.f.code], row.municipio, row.departamento);
  const date = (row.fecha ?? '').slice(0, 10);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const impact: NonNullable<HazardEvent['impact']> = {};
  for (const k of ['deaths', 'injured', 'missing', 'people', 'families', 'homesDestroyed', 'homesDamaged', 'roads', 'hectares'] as const) {
    const v = num(row[ds.f[k]]);
    if (v) impact[k] = k === 'hectares' ? Math.round(v * 10) / 10 : Math.round(v);
  }
  return {
    id: `ungrd-${ds.id}-${(row[':id'] ?? `${date}-${m.code}-${row.evento}`).replace(/[^\w-]/g, '').slice(-40)}`,
    source: 'ungrd',
    kind,
    title: titleCase(normalizeName(row.evento ?? '')),
    date,
    lat: m.lat,
    lon: m.lon,
    place: `${m.name}, ${m.dept}`,
    approx: true,
    url: `https://www.datos.gov.co/d/${ds.id}`,
    verified: true,
    impact: Object.keys(impact).length ? impact : null,
    magnitude: null,
    note: null,
  };
}

const selectFor = (ds: (typeof UNGRD_DATASETS)[number]) =>
  [':id', 'fecha', 'evento', 'municipio', 'departamento', ds.f.code, ...Object.entries(ds.f).filter(([k]) => k !== 'code').map(([, v]) => v)].join(',');

const datasetsFor = (fromYear: number, toYear: number) => UNGRD_DATASETS.filter((d) => d.to >= fromYear && d.from <= toYear);

/** Último día publicado por UNGRD (el conjunto más reciente). */
export async function ungrdLatest(): Promise<string | null> {
  const last = UNGRD_DATASETS.at(-1)!;
  const rows = await soda<{ max_fecha?: string }>(last.id, { $select: 'max(fecha)' });
  return rows[0]?.max_fecha?.slice(0, 10) ?? null;
}

/** Emergencias agroclimáticas entre dos fechas (YYYY-MM-DD, máximo unos meses). */
export async function ungrdEvents(from: string, to: string): Promise<HazardEvent[]> {
  const sets = datasetsFor(Number(from.slice(0, 4)), Number(to.slice(0, 4)));
  const pages = await Promise.all(
    sets.map((ds) =>
      soda<Row>(ds.id, {
        $select: selectFor(ds),
        $where: `fecha between '${from}T00:00:00' and '${to}T23:59:59'`,
        $order: 'fecha DESC',
        $limit: '5000',
      }).then((rows) => rows.map((r) => toEvent(r, ds)).filter((e): e is HazardEvent => e !== null)),
    ),
  );
  return pages.flat();
}

/**
 * Historial del municipio: conteo por tipo en todos los años publicados y las emergencias más recientes.
 * Se busca por código y por nombre (el código no siempre es confiable) y cada fila se vuelve a ubicar.
 */
export async function ungrdHistory(code: string) {
  const m = municipio(code);
  if (!m) return { byKind: [], recent: [] };
  const codes = `'${m.code}','${String(Number(m.code))}'`;
  const names = [...new Set([normalizeName(m.name), m.name.toUpperCase()])].map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const pages = await Promise.all(
    UNGRD_DATASETS.map((ds) =>
      soda<Row>(ds.id, {
        $select: selectFor(ds),
        $where: `${ds.f.code} in (${codes}) or upper(municipio) in (${names})`,
        $order: 'fecha DESC',
        $limit: '3000',
      }).then((rows) => rows.map((r) => toEvent(r, ds)).filter((e): e is HazardEvent => e !== null && e.place === `${m.name}, ${m.dept}`)),
    ),
  );
  const events = pages.flat().sort((a, b) => b.date.localeCompare(a.date));
  const byKind = new Map<HazardKind, number>();
  for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  return {
    byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    recent: events.slice(0, 5),
  };
}
