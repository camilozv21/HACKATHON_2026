/**
 * Contrato de datos frontend ↔ backend de Field Shift.
 * Fuente de verdad para el equipo de backend: ver docs/api-contract.md (ejemplos JSON).
 * Todas las respuestas se validan con estos esquemas antes de llegar a la UI.
 */
import { z } from 'zod';
import { HAZARD_KINDS } from '@/features/events/kindIds';
import { LAYER_IDS } from '@/features/layers/ids';
import { RISK_KINDS } from '@/features/terrain/kinds';

// ---------------------------------------------------------------- básicos

export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const PointGeometry = z.object({ type: z.literal('Point'), coordinates: LngLat });
export const PolygonGeometry = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(LngLat).min(4)).min(1),
});
export const FieldGeometry = z.discriminatedUnion('type', [PointGeometry, PolygonGeometry]);

export const DataSource = z.enum([
  'NASA POWER',
  'SMAP',
  'GPM',
  'MODIS',
  'VIIRS',
  'ECOSTRESS',
  'GRACE',
  'SRTM',
  'Landsat/HLS',
  'MERRA-2',
  'Modelo agronómico',
  'Dato local',
  // Mercado de Colombia (precios, producción, crédito) y conclusiones redactadas por IA
  'SIPSA',
  'EVA',
  'TRM',
  'Finagro',
  'UPRA',
  'Análisis IA',
]);
export type DataSource = z.infer<typeof DataSource>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const Level = z.enum(['low', 'medium', 'high']);
export type Level = z.infer<typeof Level>;

export const Month = z.number().int().min(1).max(12);

export const LayerIdSchema = z.enum(LAYER_IDS);

/** Un número con su procedencia: siempre se muestra junto a la fuente y la confianza. */
export const Metric = z.object({
  value: z.number().nullable(),
  unit: z.string(),
  source: DataSource,
  /** Resolución espacial, p. ej. "0.5° × 0.625°" o "9 km". */
  resolution: z.string(),
  /** Periodo que representa, p. ej. "2001–2020 (promedio)" o "2025". */
  period: z.string(),
  confidence: Confidence,
  /** true si es una estimación derivada (no una medición directa del producto). */
  estimated: z.boolean().optional(),
});
export type Metric = z.infer<typeof Metric>;

// ---------------------------------------------------------------- cultivos y finca

export const CROP_IDS = [
  'maize',
  'soybean',
  'wheat',
  'rice',
  'coffee',
  'beans',
  'sorghum',
  'millet',
  'cowpea',
  'groundnut',
  'chickpea',
  'mungbean',
  'barley',
  'oats',
  'potato',
  'cassava',
  'plantain',
  'sugarcane',
  'cotton',
  'sunflower',
  'alfalfa',
  'clover',
  'vetch',
  'rye',
  'radish',
  'pasture',
  'forage-peanut',
  'shade-trees',
  'vegetables',
  /** Calabaza / ahuyama / zapallo: la tercera hermana de la milpa. */
  'squash',
  /** Guandul (gandul): leguminosa arbustiva de raíz profunda. */
  'pigeonpea',
  'fallow',
] as const;
export const CropId = z.enum(CROP_IDS);
export type CropId = z.infer<typeof CropId>;

export const CropSeason = z.object({
  crop: CropId,
  startMonth: Month,
  endMonth: Month,
  /** Año relativo dentro de la rotación (1, 2, 3…). */
  year: z.number().int().min(1).max(3).default(1),
  role: z.enum(['cash', 'cover', 'forage', 'fallow', 'perennial', 'intercrop']).default('cash'),
});
export type CropSeason = z.infer<typeof CropSeason>;

export const SoilInfo = z.object({
  texture: z.enum(['sandy', 'loam', 'clay', 'silt', 'unknown']),
  organicMatterPct: z.number().min(0).max(100).optional(),
  ph: z.number().min(0).max(14).optional(),
  drainage: z.enum(['poor', 'moderate', 'good']).optional(),
});
export type SoilInfo = z.infer<typeof SoilInfo>;

export const FERTILIZATION = ['none', 'organic', 'synthetic', 'both'] as const;
export const RESIDUES = ['leave', 'burn', 'graze', 'remove'] as const;
export const SURVEY_PESTS = ['armyworm', 'soil-pests', 'fungus', 'weeds', 'animals'] as const;
export const HARVEST_PURPOSE = ['home', 'sale', 'both'] as const;

/**
 * Encuesta corta "Cuéntanos de tu terreno": historial y manejo, lo que los satélites no ven.
 * Todo es opcional (null = sin responder). Suelo, drenaje y riego NO van aquí: son `soil` y `priorities`.
 */
export const FieldSurvey = z.object({
  /** Lo que la persona suele sembrar en este terreno. */
  usualCrops: z.array(CropId).max(12),
  /** Lo último que sembró ('fallow' = lo dejó descansar). Sirve para no repetir familia y sus plagas. */
  lastCrop: CropId.nullable(),
  fertilization: z.enum(FERTILIZATION).nullable(),
  /** Qué hace con el rastrojo después de cosechar. */
  residues: z.enum(RESIDUES).nullable(),
  /** Problemas que se repiten. [] = ninguno; null = sin responder. */
  pests: z.array(z.enum(SURVEY_PESTS)).max(SURVEY_PESTS.length).nullable(),
  /** Para qué es la cosecha. */
  purpose: z.enum(HARVEST_PURPOSE).nullable(),
});
export type FieldSurvey = z.infer<typeof FieldSurvey>;

export const FieldInput = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  geometry: FieldGeometry,
  areaHa: z.number().positive().nullable(),
  currentRotation: z.array(CropSeason),
  soil: SoilInfo.optional(),
  /** Encuesta del terreno, si la persona la respondió (historial y manejo). */
  survey: FieldSurvey.optional(),
  /** Pista para mocks/backend: finca de demostración. */
  demoId: z.string().optional(),
});
export type FieldInput = z.infer<typeof FieldInput>;

// ---------------------------------------------------------------- prioridades

const Weight = z.number().int().min(0).max(5);
export const FarmerPriorities = z.object({
  waterSaving: Weight,
  soilHealth: Weight,
  income: Weight,
  forage: Weight,
  erosionControl: Weight,
  laborEquipment: Weight,
  constraints: z.object({
    irrigation: z.enum(['none', 'limited', 'full']),
    equipment: z.array(z.string()),
    markets: z.array(z.string()),
  }),
});
export type FarmerPriorities = z.infer<typeof FarmerPriorities>;

export const DEFAULT_PRIORITIES: FarmerPriorities = {
  waterSaving: 3,
  soilHealth: 3,
  income: 3,
  forage: 1,
  erosionControl: 3,
  laborEquipment: 2,
  constraints: { irrigation: 'none', equipment: [], markets: [] },
};

// ---------------------------------------------------------------- clima

export const ClimateMonth = z.object({
  month: Month,
  tMean: Metric,
  tMax: Metric,
  tMin: Metric,
  precip: Metric,
  et: Metric,
  soilMoisture: Metric,
  soilMoistureAnomaly: Metric,
  ndvi: Metric,
  frostDays: Metric,
  heatDays: Metric,
});
export type ClimateMonth = z.infer<typeof ClimateMonth>;

export const ClimateTrendPoint = z.object({
  year: z.number().int(),
  tMean: z.number().nullable(),
  precip: z.number().nullable(),
});

export const ClimateProfile = z.object({
  location: z.object({ lat: z.number(), lon: z.number(), elevationM: z.number().nullable() }),
  baselinePeriod: z.string(),
  latestYear: z.number().int(),
  months: z.array(ClimateMonth).length(12),
  /** Serie anual para "Cómo ha cambiado" (20+ años). */
  trend: z.array(ClimateTrendPoint),
  summary: z.object({
    annualPrecipMm: z.number().nullable(),
    /** % de cambio de lluvia: últimos 5 años vs. primeros 5 de la serie. */
    precipChangePct: z.number().nullable(),
    /** °C de cambio: últimos 5 años vs. primeros 5. */
    tempChangeC: z.number().nullable(),
    /** % del último año frente al promedio. */
    latestYearPrecipAnomalyPct: z.number().nullable(),
    latestYearTempAnomalyC: z.number().nullable(),
  }),
  sources: z.array(DataSource),
});
export type ClimateProfile = z.infer<typeof ClimateProfile>;

// ---------------------------------------------------------------- hallazgos

export const FieldInsights = z.object({
  bareSoilPeriods: z.array(z.object({ startMonth: Month, endMonth: Month, reason: z.string() })),
  stressSeasons: z.array(
    z.object({
      kind: z.enum(['heat', 'drought', 'frost', 'waterlogging']),
      months: z.array(Month).min(1),
      severity: Level,
      source: DataSource,
      note: z.string().optional(),
    }),
  ),
  waterTrend: z.object({
    direction: z.enum(['down', 'stable', 'up']),
    cmPerYear: z.number().nullable(),
    period: z.string(),
    source: DataSource,
    confidence: Confidence,
  }),
  erosionRisk: z.object({
    level: Level,
    slopePct: z.number().nullable(),
    extremeRainDaysPerYear: z.number().nullable(),
    explanation: z.string(),
    source: z.array(DataSource),
  }),
  waterloggingRisk: z.object({ level: Level, explanation: z.string() }).optional(),
  /** Zonas de riesgo dentro del polígono (mini mapa), si el backend las calcula. */
  zones: z
    .object({
      type: z.literal('FeatureCollection'),
      features: z.array(
        z.object({
          type: z.literal('Feature'),
          properties: z.object({ risk: Level, label: z.string() }),
          geometry: PolygonGeometry,
        }),
      ),
    })
    .optional(),
});
export type FieldInsights = z.infer<typeof FieldInsights>;

// ---------------------------------------------------------------- estrategias

export const Evidence = z.object({
  id: z.string(),
  source: DataSource,
  /** Frase simple: "SMAP muestra suelo seco en julio–agosto". */
  statement: z.string(),
  /** Regla agronómica que la conecta con la recomendación. */
  rule: z.string().optional(),
  layerId: LayerIdSchema.optional(),
  /** Fecha sugerida para ver la capa (YYYY-MM-DD). */
  date: z.string().optional(),
  months: z.array(Month).optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const SCORE_KEYS = ['water', 'soilOrganicMatter', 'nitrogen', 'erosion', 'pestBreak', 'income', 'forage'] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
const Score = z.number().min(0).max(100);

/**
 * Mercado de un cultivo de la estrategia (Colombia): precio mayorista SIPSA, rendimiento EVA y crédito Finagro.
 * Todas las cifras son de fuentes públicas; `outlook` es una conclusión redactada (IA o reglas) sin cifras.
 */
export const MarketCrop = z.object({
  crop: CropId,
  /** Producto del catálogo de mercado (src/lib/market/catalog.ts), p. ej. "platano", "tomate". */
  product: z.string(),
  /** Mediana de 12 meses del precio mayorista ($/kg) en la central de referencia. */
  priceCopKg: z.number().nullable(),
  /** Central SIPSA de referencia y distancia en línea recta (km). */
  market: z.string().nullable(),
  distanceKm: z.number().nullable(),
  /** Último mes con precio (YYYY-MM). */
  month: z.string().nullable(),
  change12mPct: z.number().nullable(),
  volatility: Level.nullable(),
  supplyTrend: z.enum(['up', 'flat', 'down']).nullable(),
  yieldTHa: z.number().nullable(),
  yieldScope: z.enum(['dept', 'national']).nullable(),
  /** Ingreso bruto aproximado por hectárea y cosecha (precio mayorista × rendimiento). No descuenta costos. */
  revenueCopHa: z.number().nullable(),
  monthsToFirstHarvest: z.number().nullable(),
  credit: z.object({ chain: z.string(), n: z.number(), small: z.number() }).nullable(),
  /** Ajuste que se aplicó al puntaje de ingresos por el mercado local (1 = sin cambio). */
  factor: z.number(),
  outlook: z
    .object({
      label: z.enum(['favorable', 'neutral', 'unfavorable']),
      why: z.string(),
      by: z.enum(['claude', 'rules']),
      confidence: Confidence,
    })
    .nullable(),
});
export type MarketCrop = z.infer<typeof MarketCrop>;

export const StrategyMarket = z.object({
  /** Frase simple: "El plátano se vende bien cerca: Armenia (Mercar) a 12 km". */
  summary: z.string(),
  crops: z.array(MarketCrop).max(6),
  confidence: Confidence,
  risks: z.array(z.string()),
  gaps: z.array(z.string()),
  /** Fecha del último precio usado (YYYY-MM-DD). */
  asOf: z.string(),
});
export type StrategyMarket = z.infer<typeof StrategyMarket>;

export const RotationStrategy = z.object({
  id: z.string(),
  name: z.string(),
  isCurrent: z.boolean(),
  durationMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
  seasons: z.array(CropSeason).min(1),
  scores: z.object({
    water: Score,
    soilOrganicMatter: Score,
    nitrogen: Score,
    erosion: Score,
    pestBreak: Score,
    income: Score,
    forage: Score,
  }),
  rationale: z.string(),
  evidence: z.array(Evidence),
  benefits: z.array(z.string()),
  risks: z.array(z.string()),
  dataGaps: z.array(z.string()),
  needsLocalReview: z.array(z.string()),
  confidence: Confidence,
  /** Uso de agua y cobertura del suelo por mes (para "comparar 2"). */
  monthly: z
    .array(z.object({ month: Month, waterUseMm: z.number().min(0), soilCovered: z.boolean() }))
    .length(12)
    .optional(),
  /** Mercado de los cultivos de la estrategia (solo en Colombia y si hay datos). */
  market: StrategyMarket.optional(),
});
export type RotationStrategy = z.infer<typeof RotationStrategy>;

// ---------------------------------------------------------------- datos que faltan (el análisis se los pide al agricultor)

/**
 * Datos de la finca que los satélites no ven y que el análisis le pide al agricultor:
 * soil-type → field.soil.texture · drainage → field.soil.drainage · soil-test → field.soil.ph / organicMatterPct ·
 * current-rotation → field.currentRotation · irrigation → priorities.constraints.irrigation.
 */
export const DATA_NEEDS = ['current-rotation', 'soil-type', 'irrigation', 'drainage', 'soil-test'] as const;
export const DataNeed = z.enum(DATA_NEEDS);
export type DataNeed = z.infer<typeof DataNeed>;

export const DataRequest = z.object({
  need: DataNeed,
  /** Por qué lo pedimos, en una frase simple y en el idioma pedido. */
  reason: z.string().max(240),
  /** Cuánto cambia el análisis con ese dato (high = puede cambiar la recomendación). */
  impact: Level,
  /** Estrategias que se ajustarían con ese dato. */
  strategyIds: z.array(z.string()).optional(),
});
export type DataRequest = z.infer<typeof DataRequest>;

/** Lista tolerante: las peticiones desconocidas o mal formadas se ignoran (el backend puede sumar tipos nuevos). */
const DataRequestList = z
  .array(z.unknown())
  .transform((list) => list.flatMap((r) => {
    const p = DataRequest.safeParse(r);
    return p.success ? [p.data] : [];
  }).slice(0, DATA_NEEDS.length));

// ---------------------------------------------------------------- análisis

export const AnalysisRequest = z.object({
  field: FieldInput,
  priorities: FarmerPriorities,
  locale: z.enum(['es', 'en']),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequest>;

export const AnalysisResponse = z
  .object({
    field: FieldInput,
    climate: ClimateProfile,
    insights: FieldInsights,
    strategies: z.array(RotationStrategy).min(3),
    generatedAt: z.iso.datetime(),
    disclaimer: z.string(),
    /**
     * Datos que faltan para completar el análisis; la app se los pregunta al agricultor ([] = no falta nada).
     * Si no viene, el cliente lo deduce de lo que envió.
     */
    dataRequests: DataRequestList.optional(),
    /** true si la respuesta viene de datos simulados. */
    mock: z.boolean().optional(),
    /** Contexto de mercado de la zona (Colombia). Sin él, "ingresos" usa valores relativos genéricos. */
    market: z
      .object({
        deptCode: z.string(),
        deptName: z.string(),
        nearestMarket: z.object({ name: z.string(), distanceKm: z.number() }).nullable(),
        trmCop: z.number().nullable(),
        fertilizerChange12mPct: z.number().nullable(),
        asOf: z.string(),
        source: z.enum(['db', 'seed']),
      })
      .optional(),
  })
  .refine((r) => r.strategies.filter((s) => s.isCurrent).length === 1, {
    message: 'Debe haber exactamente una estrategia actual (isCurrent)',
    path: ['strategies'],
  });
export type AnalysisResponse = z.infer<typeof AnalysisResponse>;

// ---------------------------------------------------------------- región (drawer de sensores)

export const REGION_CARD_IDS = ['soil-moisture', 'rain', 'ndvi', 'heat', 'et', 'groundwater', 'relief'] as const;

export const RegionSensorCard = z.object({
  id: z.enum(REGION_CARD_IDS),
  /** Misión o producto (SMAP, GPM IMERG, MODIS Terra/Aqua, ECOSTRESS en la ISS, GRACE-FO, SRTM). */
  mission: z.string(),
  source: DataSource,
  layerId: LayerIdSchema.optional(),
  /** Fecha del dato (YYYY-MM-DD). */
  date: z.string(),
  resolution: z.string(),
  confidence: Confidence,
  /** Frase corta para el agricultor: "Más seco que lo normal". */
  headline: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  /** Valor de referencia (lo normal, otro periodo…). */
  comparison: z.object({ label: z.string(), value: z.number().nullable(), unit: z.string() }).optional(),
  /** Estado para el semáforo (siempre acompañado de ícono y texto). */
  status: z.enum(['good', 'watch', 'alert']),
  /** Serie corta para la sparkline (más antiguo → más reciente). */
  series: z.array(z.number()).max(60),
  seriesLabel: z.string(),
  glossary: z.string().optional(),
  estimated: z.boolean().optional(),
  /** Dato simulado (mock) en vez de un producto NASA real: la UI lo marca. */
  simulated: z.boolean().optional(),
});
export type RegionSensorCard = z.infer<typeof RegionSensorCard>;

export const RegionSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  kind: z.enum(['demo', 'cell']),
  demoId: z.string().optional(),
  center: LngLat,
  /** [oeste, sur, este, norte] */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  cards: z.array(RegionSensorCard).min(1),
  /** Máquina del tiempo: el periodo pasado que se está revisando (sin él, los datos son los más recientes). */
  period: z.object({ start: z.string(), end: z.string(), label: z.string(), partial: z.boolean() }).optional(),
  /** 2–3 frases generadas a partir de los datos. */
  alerts: z.array(z.string()).max(4),
  generatedAt: z.iso.datetime(),
  sources: z.array(DataSource),
  mock: z.boolean().optional(),
});
export type RegionSummary = z.infer<typeof RegionSummary>;

// La radio del campo (emisoras, segmentos y programa del día) está después de AgentAction: sus pistas
// sobre el globo reutilizan esas acciones.

// ---------------------------------------------------------------- eventos y emergencias

export { HAZARD_KINDS } from '@/features/events/kindIds';
export const HazardKind = z.enum(HAZARD_KINDS);
export type HazardKind = z.infer<typeof HazardKind>;

/** eonet = NASA EONET (satélite y agencias), ungrd = registro oficial de Colombia, community = reporte de la app. */
export const HazardSource = z.enum(['eonet', 'ungrd', 'community']);
export type HazardSource = z.infer<typeof HazardSource>;

/** Lo que afecta un evento reportado por la comunidad (sin datos personales). */
export const REPORT_IMPACTS = ['crops', 'animals', 'road', 'water', 'homes', 'people'] as const;
export const ReportImpact = z.enum(REPORT_IMPACTS);
export type ReportImpact = z.infer<typeof ReportImpact>;

const Count = z.number().int().min(0).max(10_000_000);

export const HazardEvent = z.object({
  id: z.string().max(80),
  source: HazardSource,
  kind: HazardKind,
  /** Nombre del evento tal como lo da la fuente (ej. "MOVIMIENTO EN MASA", "Flood in Colombia"). */
  title: z.string().max(200),
  /** YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** "Salento, Quindío" */
  place: z.string().max(160).nullable(),
  /** La ubicación es aproximada (UNGRD: centro del municipio; comunidad: redondeada a ~100 m). */
  approx: z.boolean(),
  url: z.string().url().nullable(),
  /** Confirmado por una entidad oficial o una agencia. Los reportes de la comunidad llegan sin verificar. */
  verified: z.boolean(),
  /** Afectación registrada por UNGRD. */
  impact: z
    .object({
      deaths: Count,
      injured: Count,
      missing: Count,
      people: Count,
      families: Count,
      homesDestroyed: Count,
      homesDamaged: Count,
      roads: Count,
      hectares: z.number().min(0).max(100_000_000),
    })
    .partial()
    .nullable(),
  /** Magnitud que da EONET (ej. 5225 hectare). */
  magnitude: z.object({ value: z.number(), unit: z.string().max(40) }).nullable(),
  /** Descripción del reporte de la comunidad. */
  note: z.string().max(280).nullable(),
  impacts: z.array(ReportImpact).max(REPORT_IMPACTS.length).optional(),
  /** Reporte de ejemplo para la demostración (no es un reporte real). */
  sample: z.boolean().optional(),
});
export type HazardEvent = z.infer<typeof HazardEvent>;

export const EventSourceStatus = z.object({
  id: HazardSource,
  /** not-yet: la fuente todavía no publica datos para este periodo (UNGRD llega con retraso). */
  status: z.enum(['ok', 'empty', 'not-yet', 'error']),
  count: z.number().int().min(0),
  /** Último día con datos publicados (YYYY-MM-DD). */
  latest: z.string().nullable(),
});
export type EventSourceStatus = z.infer<typeof EventSourceStatus>;

export const EventsResponse = z.object({
  from: z.string(),
  to: z.string(),
  events: z.array(HazardEvent).max(5000),
  sources: z.array(EventSourceStatus),
});
export type EventsResponse = z.infer<typeof EventsResponse>;

/** Historial oficial del municipio más cercano (UNGRD) y eventos recientes alrededor. */
export const EventHistory = z.object({
  place: z.object({ code: z.string(), name: z.string(), dept: z.string(), distanceKm: z.number() }).nullable(),
  years: z.object({ from: z.number().int(), to: z.number().int() }),
  total: z.number().int().min(0),
  byKind: z.array(z.object({ kind: HazardKind, count: z.number().int().min(0) })),
  recent: z.array(HazardEvent).max(10),
  /** Eventos de NASA EONET y de la comunidad a menos de 50 km en los últimos 90 días (o en el periodo pedido). */
  nearby: z.array(HazardEvent).max(10),
  status: z.enum(['ok', 'outside', 'error']),
});
export type EventHistory = z.infer<typeof EventHistory>;

/** Reporte de la comunidad: sin nombre, teléfono ni correo. */
export const CommunityReportInput = z.object({
  kind: HazardKind,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  place: z.string().trim().max(120).optional(),
  impacts: z.array(ReportImpact).max(REPORT_IMPACTS.length),
  note: z.string().trim().max(280).optional(),
});
export type CommunityReportInput = z.infer<typeof CommunityReportInput>;

export const CommunityReportResponse = z.object({ report: HazardEvent });

// ---------------------------------------------------------------- agente IA (n8n) — ver docs/agent-contract.md

// ---------------------------------------------------------------- perfil de inicio (/api/profile)

/** Quién usa la app: agricultor/a o técnico/a (agrónomo, extensionista). */
export const USER_ROLES = ['farmer', 'technician'] as const;
export const UserRole = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRole>;

/** Qué quiere hacer hoy: ver el clima de su zona, escoger qué sembrar o revisar datos de satélite. */
export const ONBOARDING_GOALS = ['climate', 'rotations', 'satellite'] as const;
/** Cómo prefiere la información: escucharla, leer poco o leer todo con detalle. */
export const READING_PREFS = ['listen', 'little', 'detail'] as const;
export const DISPLAY_MODES = ['lite', 'full'] as const;
export const FIRST_STEPS = ['myArea', 'myFarm', 'layers', 'explore'] as const;

export const OnboardingAnswers = z.object({
  role: UserRole,
  goal: z.enum(ONBOARDING_GOALS),
  reading: z.enum(READING_PREFS),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

/** Nivel que mostró en los retos de inicio (minijuegos del glosario): semilla, brote o cosecha. */
export const QUEST_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type QuestLevel = (typeof QUEST_LEVELS)[number];
/** Id de un término del glosario (ndvi, et, anomaly, frost…). */
const TermId = z.string().regex(/^[a-z-]{2,40}$/);

/** Resultado de los retos de inicio: estrellas, nivel, términos que domina y los que conviene repasar. */
export const QuestSummary = z.object({
  level: z.enum(QUEST_LEVELS),
  stars: z.number().int().min(0).max(60),
  maxStars: z.number().int().min(1).max(60),
  mastered: z.array(TermId).max(12),
  review: z.array(TermId).max(12),
});
export type QuestSummary = z.infer<typeof QuestSummary>;

export const ProfileRequest = z.object({
  answers: OnboardingAnswers,
  locale: z.enum(['es', 'en']),
  /** Opcional: si jugó los retos, la IA lo usa para el saludo (qué ya entiende y qué le explicaremos). */
  quest: QuestSummary.optional(),
});
export type ProfileRequest = z.infer<typeof ProfileRequest>;

/** Sugerencia de la IA (o de las reglas locales): la persona la confirma o la cambia antes de aplicarla. */
export const ProfileSuggestion = z.object({
  role: UserRole,
  mode: z.enum(DISPLAY_MODES),
  narrator: z.boolean(),
  /** Saludo corto, pensado también para leerse en voz alta. */
  welcome: z.string().trim().min(1).max(280),
  /** Por qué se sugiere este modo (frases cortas). */
  reasons: z.array(z.string().trim().min(1).max(160)).max(3),
  /** Preguntas para empezar el chat con el asistente. */
  suggestions: z.array(z.string().trim().min(1).max(160)).max(3),
  firstStep: z.enum(FIRST_STEPS),
  source: z.enum(['claude', 'rules']),
});
export type ProfileSuggestion = z.infer<typeof ProfileSuggestion>;

/** Lo que el agente sabe de la persona para adaptar sus respuestas (largo, términos técnicos, lectura en voz alta). */
export const AgentProfile = z.object({
  role: UserRole.optional(),
  mode: z.enum(DISPLAY_MODES),
  narrator: z.boolean(),
  /** Nivel en los retos de inicio (si los jugó): beginner = explicar cada término la primera vez. */
  level: z.enum(QUEST_LEVELS).optional(),
  /** Términos del glosario que le costaron en los retos: explicarlos en una frase simple cuando aparezcan. */
  review: z.array(TermId).max(12).optional(),
});
export type AgentProfile = z.infer<typeof AgentProfile>;

export const ChatTurn = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) });

export const AgentRequest = z.object({
  sessionId: z.string().min(8).max(64),
  message: z.string().trim().min(1).max(1000),
  locale: z.enum(['es', 'en']),
  userLocation: z
    .object({
      lat: z.number(),
      lon: z.number(),
      accuracy: z.enum(['ip', 'precise']),
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
    })
    .nullable(),
  view: z.object({
    center: LngLat,
    zoom: z.number(),
    activeLayerId: LayerIdSchema.optional(),
    layerDate: z.string().optional(),
    openRegionId: z.string().optional(),
    fieldId: z.string().optional(),
    /** Máquina del tiempo: fecha pasada que la persona está revisando (YYYY-MM o YYYY-MM-DD). */
    when: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
    /** Datos de la finca que el análisis todavía no tiene: el agente debe pedirlos antes de recomendar. */
    missingData: z.array(DataNeed).max(DATA_NEEDS.length).optional(),
  }),
  history: z.array(ChatTurn).max(10),
  /** Perfil de la persona (preguntas de inicio y Ajustes): rol, modo sencillo/completo y si la respuesta se leerá en voz alta. */
  profile: AgentProfile.optional(),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** Acciones que el agente puede pedir sobre el globo. Las desconocidas se ignoran en el cliente. */
export const AgentAction = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('flyTo'),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      zoom: z.number().min(0).max(20).optional(),
      /** Si no trae lat/lon, el cliente geocodifica este nombre. */
      label: z.string().optional(),
    })
    .refine((a) => (a.lat != null && a.lon != null) || Boolean(a.label), { message: 'flyTo necesita lat/lon o label' }),
  z.object({ type: z.literal('fitBounds'), bbox: Bbox }),
  z.object({
    type: z.literal('setLayer'),
    layerId: LayerIdSchema,
    date: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    /** Solo con layerId "risk": qué riesgo pintar (por defecto el combinado). */
    risk: z.enum(RISK_KINDS).optional(),
  }),
  z.object({ type: z.literal('clearLayers') }),
  z.object({ type: z.literal('openRegion'), lat: z.number(), lon: z.number(), name: z.string().optional() }),
  z.object({
    type: z.literal('highlightArea'),
    geojson: z.object({ type: z.string() }).passthrough(),
  }),
  z.object({ type: z.literal('showStrategies'), fieldId: z.string().optional() }),
  /** Poner la radio; con lat/lon suena el boletín de ese lugar (clima, suelo, alertas y precios leídos en voz). */
  z.object({
    type: z.literal('playRadio'),
    stationId: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    name: z.string().max(120).optional(),
  }),
  /** Máquina del tiempo: revisar una fecha pasada (null = volver a hoy). */
  z.object({ type: z.literal('setTime'), when: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable() }),
  /** Mostrar (u ocultar) los eventos y emergencias en el globo, opcionalmente solo de un tipo. */
  z.object({ type: z.literal('showEvents'), on: z.boolean().optional(), kind: HazardKind.optional() }),
  /** Preparar el informe agroclimático de una zona (sin lat/lon: lo que se mira) para un mes o los últimos 30 días. */
  z.object({
    type: z.literal('agroReport'),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    name: z.string().max(120).optional(),
    when: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
  }),
  /** Abrir el formulario para reportar un evento (la persona lo revisa y lo envía). */
  z.object({
    type: z.literal('reportEvent'),
    kind: HazardKind.optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  }),
  /** Abrir las preguntas rápidas del análisis de la finca (en ese dato, si viene) para completar lo que falta. */
  z.object({ type: z.literal('askForData'), need: DataNeed.optional().catch(undefined) }),
  /** Mostrar (u ocultar) las fincas que venden en el globo y, si viene, abrir la tarjeta de una publicación. */
  z.object({ type: z.literal('showListings'), on: z.boolean().optional(), listingId: z.string().max(40).optional() }),
]);
export type AgentAction = z.infer<typeof AgentAction>;

// ---------------------------------------------------------------- radio del campo

export const RadioStation = z.object({
  id: z.string().max(80),
  name: z.string(),
  region: z.string(),
  /** null = emisora nacional (sin ubicación en el globo). */
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  frequencyLabel: z.string(),
  /** BCP-47 corto: es, en… (también se usa para la voz de respaldo). */
  language: z.string(),
  distanceKm: z.number().nullable().optional(),
  /** Emisora de la zona: la arma la app con los datos de ese punto (no es una emisora real). */
  local: z.boolean().optional(),
});
export type RadioStation = z.infer<typeof RadioStation>;

/** Bloques del programa del día, en el orden en que suenan. */
export const RADIO_TOPICS = ['intro', 'weather', 'soil', 'vegetation', 'events', 'terrain', 'market', 'advice', 'outro'] as const;
export const RadioTopic = z.enum(RADIO_TOPICS);
export type RadioTopic = z.infer<typeof RadioTopic>;

/** Lo que la radio puede hacer en el globo mientras habla: cámara, capas y paneles. Nunca abre formularios. */
export const RADIO_CUE_TYPES = ['flyTo', 'setLayer', 'clearLayers', 'openRegion', 'showEvents', 'showListings'] as const;
export const RadioCue = z.object({
  /** Frase del guion (0 = la primera) en la que ocurre la acción. */
  sentence: z.number().int().min(0).max(60),
  action: AgentAction.refine((a) => (RADIO_CUE_TYPES as readonly string[]).includes(a.type), { message: 'acción no permitida en la radio' }),
});
export type RadioCue = z.infer<typeof RadioCue>;

export const RadioSegment = z.object({
  id: z.string(),
  /** news = bloque del programa del día (generado con los datos del punto). */
  type: z.enum(['ad', 'alert', 'tip', 'news']),
  title: z.string(),
  sponsor: z.string().optional(),
  /** mp3 generado con IA. Sin audio, el guion se lee con la voz del dispositivo, frase por frase. */
  audioUrl: z.string().optional(),
  durationSec: z.number().positive(),
  transcript: z.string(),
  regionId: z.string(),
  /** Idioma del guion (si falta, el de la emisora). */
  language: z.string().optional(),
  relatedLayerId: LayerIdSchema.optional(),
  /** Fuente NASA del dato que menciona un consejo o alerta. */
  dataSource: DataSource.optional(),
  topic: RadioTopic.optional(),
  /** Datos que usa el bloque, con su fecha ("SMAP", "2026-11-12"). */
  sources: z.array(z.object({ dataset: z.string(), date: z.string().optional() })).max(6).optional(),
  confidence: Confidence.optional(),
  /** Lo que el dato no dice o lo que falta (vacío de información). */
  caveat: z.string().optional(),
  /** Valor de demostración, no medido. */
  simulated: z.boolean().optional(),
  /** Acciones sobre el globo sincronizadas con el guion. */
  cues: z.array(RadioCue).max(8).optional(),
});
export type RadioSegment = z.infer<typeof RadioSegment>;

export const RadioStationsResponse = z.object({ stations: z.array(RadioStation) });
export const RadioSegmentsResponse = z.object({ station: RadioStation, segments: z.array(RadioSegment) });

/** GET /api/radio/program: el programa del día de un punto, escrito con sus datos (NASA, eventos, mercado, terreno). */
export const RadioProgramResponse = z.object({
  station: RadioStation,
  place: z.string(),
  segments: z.array(RadioSegment).min(1).max(12),
  generatedAt: z.iso.datetime(),
  /** Quién escribió el guion: Claude o las plantillas locales (sin IA). Los datos son los mismos. */
  by: z.enum(['claude', 'rules']),
  /** Llegó el de plantillas y el de Claude se está escribiendo: pedirlo otra vez sin `quick`. */
  pending: z.boolean().optional(),
});
export type RadioProgramResponse = z.infer<typeof RadioProgramResponse>;

export const AgentResponse = z.object({
  /** Markdown simple (se renderiza sanitizado, sin HTML). */
  reply: z.string().min(1).max(6000),
  /** Se validan una por una en el cliente (las desconocidas se ignoran sin romper la respuesta). */
  actions: z.array(z.unknown()).max(12).optional(),
  sources: z.array(z.object({ dataset: z.string(), date: z.string().optional(), url: z.string().url().optional() })).optional(),
  suggestions: z.array(z.string().max(160)).max(4).optional(),
});
export type AgentResponse = z.infer<typeof AgentResponse>;
