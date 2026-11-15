/**
 * Contrato del plan de rotación con el motor agronómico (API del equipo en FastAPI, `POST /api/v1/evaluaciones`).
 * El teléfono nunca llama al motor directo: pasa por `/api/motor/*` (Next), que guarda la URL y la clave.
 * Solo se importa desde chunks diferidos (usa `zod` completo). Ver docs/motor-api.md.
 */
import { z } from 'zod';
import {
  MOTOR_CROPS,
  MOTOR_HISTORY_CROPS,
  MOTOR_RESIDUES,
  MOTOR_STAGES,
  MOTOR_SYMPTOM_IDS,
  MOTOR_TEXTURES,
} from '@/lib/motorCatalog';

const Num = z.number().finite();
const Opt = Num.nullable();

// ---------------------------------------------------------------- 1. datos de la zona

/** Un día de NASA POWER en la zona (máximo entre las celdas que toca el rectángulo de la finca). */
export const ZoneDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  t2m: Opt,
  tmax: Opt,
  tmin: Opt,
  /** Humedad relativa del aire (%). */
  rh: Opt,
  /** Lluvia (mm/día). */
  precip: Opt,
  /** Humedad del suelo en la zona de raíces y en la capa de arriba (%, GWETROOT / GWETTOP × 100). */
  soilRoot: Opt,
  soilTop: Opt,
  /** Viento a 2 m (m/s) y radiación solar (MJ/m²/día). */
  wind: Opt,
  solar: Opt,
});
export type ZoneDay = z.infer<typeof ZoneDay>;

export const MotorZone = z.object({
  /** Rectángulo de los extremos de la finca [oeste, sur, este, norte]. */
  bbox: z.tuple([Num, Num, Num, Num]),
  center: z.tuple([Num, Num]),
  /** La finca es un punto (sin contorno). */
  point: z.boolean(),
  /** Celdas de NASA POWER que toca el rectángulo y cuántas respondieron. */
  powerCells: z.number().int().min(0),
  powerCellsOk: z.number().int().min(0),
  period: z.object({ start: z.string(), end: z.string() }),
  days: z.array(ZoneDay),
  summary: z.object({
    /** Temperatura media de los últimos 7 días (°C). */
    temperature: Opt,
    tmax7d: Opt,
    relativeHumidity: Opt,
    rain7d: Opt,
    rain30d: Opt,
    /** Último dato de humedad del suelo en la zona de raíces (%). */
    soilMoisture: Opt,
    /** Altura de la celda de POWER (m); el motor usa la de su índice territorial cuando la tiene. */
    elevationM: Opt,
    /** Pendiente mediana del municipio (SRTM, %), solo en Colombia. */
    slopePct: Opt,
    flatPct: Opt,
  }),
  /** Municipios de Colombia que tocan las esquinas (pendiente SRTM). null = fuera de Colombia. */
  terrain: z.object({ places: z.array(z.string()), synthetic: z.boolean() }).nullable(),
});
export type MotorZone = z.infer<typeof MotorZone>;

export const ZoneRequest = z.object({
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('Point'), coordinates: z.tuple([Num.min(-180).max(180), Num.min(-90).max(90)]) }),
    z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.tuple([Num.min(-180).max(180), Num.min(-90).max(90)])).min(4)).length(1),
    }),
  ]),
});
export type ZoneRequest = z.infer<typeof ZoneRequest>;

// ---------------------------------------------------------------- 2. pedido del plan

export const MotorPlanRequest = z.object({
  /** Id de la finca en la app (se manda al motor como referencia anónima, con hash). */
  fieldId: z.string().min(1).max(4000),
  /** Datos de la zona del paso 1 (lo que el teléfono ya mostró). */
  zone: MotorZone.extend({ days: z.array(ZoneDay).max(120) }),
  crop: z.enum(MOTOR_CROPS).nullable(),
  stage: z.enum(MOTOR_STAGES).nullable(),
  symptoms: z.array(z.enum(MOTOR_SYMPTOM_IDS)).max(MOTOR_SYMPTOM_IDS.length),
  /** Ciclos anteriores, el más reciente primero (solo el primero cambia la rotación). */
  history: z.array(z.array(z.enum(MOTOR_HISTORY_CROPS)).min(1).max(4)).max(3),
  residue: z.enum(MOTOR_RESIDUES).nullable(),
  soil: z.object({
    ph: z.number().min(3).max(9.5).nullable(),
    organicMatterPct: z.number().min(0).max(15).nullable(),
    texture: z.enum(MOTOR_TEXTURES).nullable(),
  }),
  /** Nombre del lugar de la finca (municipio por geocodificación), para el asesor. */
  place: z.string().max(160).nullable(),
  locale: z.enum(['es', 'en']),
});
export type MotorPlanRequest = z.infer<typeof MotorPlanRequest>;

// ---------------------------------------------------------------- 3. plan (salida del motor, resumida)

/** Un valor del motor: número o intervalo ("2000 a 3000"). Siempre se muestra como texto. */
export const MotorValue = z.object({ text: z.string(), min: Opt, max: Opt });
export type MotorValue = z.infer<typeof MotorValue>;

const Level = z.enum(['low', 'medium', 'high', 'unknown']);
const Certainty = z.enum(['baja', 'media', 'alta']);
const Source = z.object({ title: z.string(), publisher: z.string().nullable(), url: z.string().nullable() });

export const MotorFinding = z.object({
  id: z.string(),
  module: z.string(),
  title: z.string(),
  severity: Level,
  certainty: Certainty,
  /** Qué baja la certeza (regla sin validar, calidad de datos…). */
  limiting: z.array(z.string()),
  observation: z.string(),
  recommendation: z.string(),
  cautions: z.array(z.string()),
  why: z.array(
    z.object({
      label: z.string(),
      observed: z.string(),
      operator: z.string().nullable(),
      threshold: z.string().nullable(),
      source: z.string().nullable(),
      period: z.string().nullable(),
      quality: z.string().nullable(),
    }),
  ),
  sources: z.array(Source),
  /** Otro hallazgo más específico lo reemplaza o lo integra: se muestra solo como contexto. */
  superseded: z.boolean(),
  /** Umbral no calibrado para la zona. */
  uncalibrated: z.boolean(),
});
export type MotorFinding = z.infer<typeof MotorFinding>;

export const CANDIDATE_STATUS = ['favorecido', 'aceptable', 'con_reservas', 'desaconsejado', 'sin_evaluar'] as const;
export const MotorReason = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  effect: z.enum(['block', 'discourage', 'favor', 'note']),
  cautions: z.array(z.string()),
});
export type MotorReason = z.infer<typeof MotorReason>;

export const MotorCandidate = z.object({
  cropKey: z.string(),
  crop: z.string(),
  family: z.string().nullable(),
  status: z.enum(CANDIDATE_STATUS),
  /** A favor, en contra y lo que bloquea (las orientaciones generales no cambian el estado y van aparte). */
  reasons: z.array(MotorReason),
  guidance: z.array(MotorReason),
  /** Reglas que no se pudieron evaluar y el dato que faltó. */
  missing: z.array(z.string()),
});
export type MotorCandidate = z.infer<typeof MotorCandidate>;

export const MotorPractice = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  cautions: z.array(z.string()),
  /** Sale de un hallazgo de esta finca (no solo del contexto general). */
  fromFinding: z.boolean(),
  sources: z.array(Source),
});
export type MotorPractice = z.infer<typeof MotorPractice>;

export const MotorPlanBase = z.object({
  /** `mock`: el motor no está conectado y se muestra una evaluación de ejemplo (la UI lo dice). */
  source: z.enum(['motor', 'mock']),
  evaluationId: z.string().nullable(),
  createdAt: z.string().nullable(),
  engine: z.object({ schemaVersion: z.string().nullable(), notebookVersion: z.string().nullable() }),
  /** Qué entradas aceptó el motor: todas, sin la serie diaria o solo lo mínimo (lat, lon, cultivo, etapa). */
  accepted: z.enum(['full', 'no-series', 'minimal']),
  context: z.object({
    cropKey: z.string().nullable(),
    crop: z.string().nullable(),
    stage: z.string().nullable(),
    altitude: MotorValue.nullable(),
    slope: MotorValue.nullable(),
    thermalFloor: z.string().nullable(),
  }),
  cell: z
    .object({ gridId: z.string(), lat: Num, lon: Num, areaKm2: Opt, distanceKm: Opt })
    .nullable(),
  territory: z
    .object({
      /**
       * Los datos del territorio (API canónica: suelos IGAC, NDVI, lluvia del mes) solo existen para Antioquia.
       * `false`: la finca queda fuera y el motor no usó ninguno. `null`: el motor no lo dijo (versión anterior).
       */
      inCoverage: z.boolean().nullable(),
      region: z.string().nullable(),
      /** Distancia a la celda más cercana de la grilla (km). */
      nearestKm: Opt,
      /** Lo que entró al motor desde el territorio (no desde la persona ni desde la serie diaria). */
      inputs: z.array(z.object({ variable: z.string(), value: MotorValue, source: z.string(), period: z.string().nullable() })),
      landscape: z.string().nullable(),
      climate: z.string().nullable(),
      soil: z.string().nullable(),
      drainage: z.string().nullable(),
      fertility: z.string().nullable(),
      erosion: z.string().nullable(),
      ndvi: Opt,
      dataAgeDays: Opt,
      notes: z.array(z.string()),
    })
    .nullable(),
  risk: z.object({ overall: Level, modules: z.array(z.object({ module: z.string(), severity: Level, findings: z.number().int() })) }),
  findings: z.array(MotorFinding),
  practices: z.array(MotorPractice),
  rotation: z.object({
    situation: z.string().nullable(),
    candidates: z.array(MotorCandidate),
    missing: z.array(z.object({ variable: z.string(), label: z.string() })),
    verify: z.array(z.string()),
    cautions: z.array(z.string()),
    history: z.array(z.array(z.string())),
  }),
  gaps: z.object({
    /** Variables que el motor no tiene para esta celda (temperatura, síntomas…). */
    notInBundle: z.array(z.string()),
    rulesEvaluated: z.number().int().nullable(),
    rulesInCatalog: z.number().int().nullable(),
    /** Reglas que no se evaluaron: por dato faltante, porque piden serie diaria o porque no aplican. */
    skipped: z.object({ missingInput: z.number().int(), needsSeries: z.number().int(), other: z.number().int() }),
    /** Datos que más reglas habilitarían, con cuántas. */
    wanted: z.array(z.object({ variable: z.string(), rules: z.number().int() })),
  }),
  cautions: z.array(z.string()),
  /** Para el agente: secciones recomendadas por el motor. */
  agentSections: z.array(z.string()),
});
export type MotorPlanBase = z.infer<typeof MotorPlanBase>;

/** Informe de AgroAstro (agente de Claude) sobre la salida del motor: el teléfono solo recibe planes revisados. */
export const MotorAdvisor = z.object({
  /** `mock`: asesor de ejemplo (sin ANTHROPIC_API_KEY o en e2e), armado solo con lo que dijo el motor. */
  source: z.enum(['agent', 'mock']),
  markdown: z.string().min(1).max(20_000),
  sessionId: z.string().nullable(),
  /** Herramientas que usó (búsquedas y lecturas en la web). */
  toolCalls: z.number().int().min(0),
});
export type MotorAdvisor = z.infer<typeof MotorAdvisor>;

export const MotorPlan = MotorPlanBase.extend({ advisor: MotorAdvisor });
export type MotorPlan = z.infer<typeof MotorPlan>;

/**
 * `/api/motor/plan` responde NDJSON: etapas (sin datos) mientras trabajan el motor y el asesor, y al final el plan
 * revisado o un error. `ping` mantiene viva la conexión mientras el asesor investiga.
 */
export const MotorStreamEvent = z.discriminatedUnion('t', [
  z.object({ t: z.literal('stage'), stage: z.enum(['motor', 'advisor']) }),
  z.object({ t: z.literal('activity'), tool: z.string().max(80), count: z.number().int().min(0) }),
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('plan'), plan: MotorPlan }),
  z.object({ t: z.literal('error'), error: z.string().max(80), status: z.number().int().nullable() }),
]);
export type MotorStreamEvent = z.infer<typeof MotorStreamEvent>;
