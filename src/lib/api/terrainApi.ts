/**
 * Contrato (zod) de la API abierta del terreno, /api/terrain (docs/terrain-api.md). Para quien la consuma: el
 * frontend, el agente o un script. Las filas de /places y /series son planas y dependen de `fields`, así que se
 * validan como registros de número | texto | null; el detalle de un lugar sí tiene forma fija.
 */
import { z } from 'zod';

const Num = z.number().finite();
const Cell = z.union([Num, z.string(), z.null()]);
export const TerrainRow = z.record(z.string(), Cell);
export type TerrainRow = z.infer<typeof TerrainRow>;

const State = z.enum(['healthy', 'stressed', 'bare', 'water']);
const Level = z.enum(['low', 'medium', 'high']);
const Hazard = z.enum(['drought', 'water', 'heat', 'soil']);
const Shares = z.object({ healthy: Num, stressed: Num, bare: Num, water: Num });
const NullableShares = z.object({ healthy: Num.nullable(), stressed: Num.nullable(), bare: Num.nullable(), water: Num.nullable() });

export const TerrainApiMeta = z.object({
  source: z.enum(['gee', 'synthetic']),
  generatedAt: z.string(),
  years: z.object({ observed: z.array(z.number().int()), projected: z.array(z.number().int()) }),
  query: z.record(z.string(), z.unknown()),
  caveats: z.array(z.string()).min(1),
  total: z.number().int().min(0).optional(),
  count: z.number().int().min(0).optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});

const Links = z.looseObject({ self: z.string(), next: z.string().nullable().optional(), catalog: z.string() });

export const TerrainListResponse = z.object({ data: z.array(TerrainRow), meta: z.looseObject(TerrainApiMeta.shape), links: Links });
export type TerrainListResponse = z.infer<typeof TerrainListResponse>;

export const TerrainSeriesPoint = Shares.extend({ year: z.number().int(), kind: z.enum(['observed', 'projected']) });

export const TerrainPlaceDetail = z.object({
  code: z.string().regex(/^\d{2}(\d{3})?$/),
  level: z.enum(['mpio', 'dpto']),
  name: z.string(),
  dpto: z.string(),
  dptoName: z.string(),
  location: z.object({ lat: Num, lon: Num, bbox: z.array(Num).length(4) }),
  areaKm2: Num,
  validShare: Num,
  confidence: z.enum(['high', 'medium', 'low']),
  indicators: z.record(z.string(), Num.nullable()),
  states: z.object({
    initial: NullableShares.extend({ period: z.string() }),
    final: NullableShares.extend({ period: z.string() }),
    change: NullableShares,
  }),
  risk: z.object({
    score: Num.nullable(),
    level: Level.nullable(),
    top: Hazard.nullable(),
    hazards: z.record(
      Hazard,
      z.object({
        score: Num.nullable(),
        level: Level.nullable(),
        evidence: z.array(z.object({ indicator: z.string(), value: Num, points: Num, source: z.string() })),
        missing: z.array(z.string()),
      }),
    ),
  }),
  markov: z
    .object({
      stepYears: z.number().int(),
      from: z.string(),
      to: z.string(),
      matrix: z.record(State, Shares),
      stay: Shares,
      trend: z.enum(['improving', 'worsening', 'stable']),
      biggestChange: z.object({ state: State, from: Num, to: Num, delta: Num }),
      mainFlow: z.object({ from: State, to: State, prob: Num, share: Num }).nullable(),
      longRun: Shares,
    })
    .nullable(),
  series: z.array(TerrainSeriesPoint),
});
export type TerrainPlaceDetail = z.infer<typeof TerrainPlaceDetail>;

export const TerrainPlaceResponse = z.object({ data: TerrainPlaceDetail, meta: TerrainApiMeta, links: Links });

export const TerrainAtResponse = z.object({
  data: z.object({
    point: z.object({ lat: Num, lon: Num }),
    mpio: TerrainPlaceDetail.nullable(),
    dpto: TerrainPlaceDetail.nullable(),
  }),
  meta: TerrainApiMeta,
  links: Links,
});
export type TerrainAtResponse = z.infer<typeof TerrainAtResponse>;

export const TerrainApiError = z.object({ error: z.string(), detail: z.string(), hint: z.record(z.string(), z.unknown()).optional() });
