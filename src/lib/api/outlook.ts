/**
 * Contrato de `POST /rotations/outlook`: cómo evoluciona cada rotación año por año (no solo un ciclo) y qué pide
 * a la familia que la trabaja (mano de obra, comida, ventas, tenencia de la tierra). Ver docs/api-contract.md y
 * docs/rotation-outlook.md.
 *
 * Vive aparte de contract.ts para que solo lo cargue el chunk "En el tiempo" (y no todos los que usan el contrato).
 */
import { z } from 'zod';
import {
  Confidence,
  CropId,
  DataSource,
  FarmerPriorities,
  FieldInput,
  Level,
  Month,
  RotationStrategy,
} from './contract';

// ---------------------------------------------------------------- entrada

export const TENURE = ['own', 'rent', 'shared', 'unknown'] as const;
export type Tenure = (typeof TENURE)[number];

/** Cómo se adopta la rotación nueva: todo el lote el primer año o por partes (¼ → ½ → todo). */
export const PACES = ['all', 'gradual'] as const;
export type Pace = (typeof PACES)[number];

/** Lo que solo sabe la familia. Todo es opcional (null = sin responder): el backend lo supone y lo dice. */
export const Household = z.object({
  /** Personas de la familia que trabajan en la finca. */
  workers: z.number().int().min(1).max(12).nullable(),
  /** La tierra es propia, arrendada, en compañía (aparcería) o no sabe. */
  tenure: z.enum(TENURE).nullable(),
  /** Pertenece a una asociación o cooperativa (semilla, venta en grupo, asistencia técnica). */
  association: z.boolean().nullable(),
});
export type Household = z.infer<typeof Household>;

/** Lo que el análisis ya sabe del sitio (clima de NASA POWER, pendiente SRTM, riesgo de erosión). */
export const OutlookSite = z
  .object({
    annualPrecipMm: z.number().nullable(),
    tMeanC: z.number().nullable(),
    elevationM: z.number().nullable(),
    slopePct: z.number().nullable(),
    erosionLevel: Level.nullable(),
  })
  .partial();
export type OutlookSite = z.infer<typeof OutlookSite>;

export const OutlookStrategyInput = RotationStrategy.pick({
  id: true,
  name: true,
  isCurrent: true,
  durationMonths: true,
  seasons: true,
  scores: true,
  confidence: true,
});
export type OutlookStrategyInput = z.infer<typeof OutlookStrategyInput>;

export const OutlookRequest = z
  .object({
    field: FieldInput,
    priorities: FarmerPriorities,
    locale: z.enum(['es', 'en']),
    /** Las estrategias del último `POST /analysis` (con la actual). */
    strategies: z.array(OutlookStrategyInput).min(1).max(8),
    site: OutlookSite.optional(),
    household: Household.optional(),
    pace: z.enum(PACES).default('all'),
    horizonYears: z.number().int().min(3).max(15).default(10),
  })
  .refine((r) => r.strategies.filter((s) => s.isCurrent).length === 1, {
    message: 'Debe haber exactamente una estrategia actual (isCurrent)',
    path: ['strategies'],
  });
export type OutlookRequest = z.input<typeof OutlookRequest>;
export type OutlookRequestParsed = z.output<typeof OutlookRequest>;

// ---------------------------------------------------------------- salida

/** Valor de un año normal y rango entre un año malo y uno bueno. */
export const YearRange = z
  .object({ mid: z.number(), low: z.number(), high: z.number() })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, { message: 'low ≤ mid ≤ high' });
export type YearRange = z.infer<typeof YearRange>;

export const PHASES = ['transition', 'building', 'stable'] as const;
export type Phase = (typeof PHASES)[number];

export const OutlookYear = z.object({
  year: z.number().int().min(1),
  /** Año dentro del ciclo de la rotación (1–3): la rotación se repite. */
  cycleYear: z.number().int().min(1).max(3),
  /** transition = se aprende y se invierte · building = el suelo y el corte de plagas se van notando · stable. */
  phase: z.enum(PHASES),
  /** Parte del lote que ya tiene la rotación nueva (0–1). */
  adopted: z.number().min(0).max(1),
  /** Cultivo de cada mes de ese año en la parte que cambió (null = suelo sin cultivo). */
  months: z.array(CropId.nullable()).length(12),
  /** Materia orgánica del suelo (%, capa de arriba). */
  soilOrganicMatterPct: YearRange,
  /** Suelo que se lava ese año (t/ha). */
  soilLossTHa: YearRange,
  /** Capa de suelo perdida desde hoy, acumulada (mm). */
  soilLostMm: z.number().min(0),
  /** Ingreso neto: 100 = lo que deja hoy tu rotación en un año normal. */
  incomeIndex: YearRange,
  /** Jornales por hectárea en el año. */
  laborDaysHa: z.number().min(0),
});
export type OutlookYear = z.infer<typeof OutlookYear>;

export const MILESTONES = [
  'trial',
  'full-adoption',
  'first-harvest',
  'first-cycle',
  'pest-break',
  'break-even',
  'soil-visible',
  'soil-test',
] as const;
export type MilestoneKind = (typeof MILESTONES)[number];

export const Milestone = z.object({
  year: z.number().int().min(1),
  kind: z.enum(MILESTONES),
  /** Frase corta en el idioma pedido. */
  text: z.string().max(240),
  refIds: z.array(z.string()).max(4),
});
export type Milestone = z.infer<typeof Milestone>;

export const SOCIAL_KINDS = ['labor', 'tenure', 'food', 'cash', 'market', 'knowledge', 'workload'] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

/** Un factor social: estado (siempre con ícono y texto en la UI), frase simple y de dónde sale. */
export const SocialFactor = z.object({
  kind: z.enum(SOCIAL_KINDS),
  status: z.enum(['good', 'watch', 'alert']),
  title: z.string().max(80),
  text: z.string().max(320),
  refIds: z.array(z.string()).max(4),
});
export type SocialFactor = z.infer<typeof SocialFactor>;

const Twelve = <T extends z.ZodType>(t: T) => z.array(t).length(12);

export const StrategyOutlook = z.object({
  strategyId: z.string(),
  /** Años que dura una vuelta de la rotación. */
  cycleYears: z.number().int().min(1).max(3),
  years: z.array(OutlookYear).min(3),
  milestones: z.array(Milestone),
  /** Año en que el ingreso acumulado alcanza al de seguir como hoy (1 = no hay bache; null = no lo alcanza en el horizonte). */
  breakEvenYear: z.number().int().min(1).nullable(),
  labor: z.object({
    /** Jornales por hectárea en cada mes de un año típico (rotación ya andando). */
    perHaByMonth: Twelve(z.number().min(0)),
    /** Jornales de toda la finca por mes (área × por hectárea). */
    farmByMonth: Twelve(z.number().min(0)),
    /** Jornales que da la familia en un mes. */
    familyPerMonth: z.number().min(0),
    peakMonths: z.array(Month).max(12),
    /** Jornales al año que habría que contratar. */
    hiredDaysYear: z.number().min(0),
  }),
  food: z.object({
    /** Hay comida de la finca para la casa (cosecha fresca o guardada). */
    months: Twelve(z.boolean()),
    gapMonths: z.array(Month).max(12),
    crops: z.array(CropId),
    /** Familias botánicas distintas de lo que se come (diversidad de la dieta). */
    families: z.number().int().min(0),
  }),
  /** Meses con algo para vender. */
  cash: z.object({ months: Twelve(z.boolean()) }),
  social: z.array(SocialFactor),
  confidence: Confidence,
});
export type StrategyOutlook = z.infer<typeof StrategyOutlook>;

export const REFERENCE_TOPICS = [
  'soil-carbon',
  'yield',
  'transition',
  'erosion',
  'stability',
  'economics',
  'smallholders',
  'food-security',
  'tenure',
  'adoption',
  'gender',
  'labor',
  'colombia',
  'intercropping',
] as const;

/** Fuente citada: estudio, informe o norma. El texto `finding` viene en el idioma pedido. */
export const Reference = z.object({
  id: z.string(),
  authors: z.string().max(200),
  year: z.number().int().min(1900).max(2100),
  title: z.string().max(300),
  venue: z.string().max(200),
  url: z.url(),
  finding: z.string().max(400),
  topic: z.enum(REFERENCE_TOPICS),
});
export type Reference = z.infer<typeof Reference>;

export const OutlookResponse = z.object({
  fieldId: z.string(),
  horizonYears: z.number().int().min(3).max(15),
  pace: z.enum(PACES),
  baseline: z.object({
    soilOrganicMatterPct: z.number().min(0).max(100),
    /** 'Dato local' si viene del análisis de laboratorio; si no, 'Modelo agronómico' (supuesto). */
    soilOrganicMatterSource: DataSource,
    /** Suelo que se lavaría al año con el suelo desnudo (t/ha). */
    bareSoilLossTHa: z.number().min(0),
    /** Pérdida que el suelo alcanza a reponer al año (t/ha). */
    tolerableSoilLossTHa: z.number().min(0),
    areaHa: z.number().positive(),
    areaAssumed: z.boolean(),
    workers: z.number().int().min(1),
    workersAssumed: z.boolean(),
    /** Jornales por hectárea al año con la rotación de hoy. */
    laborDaysHa: z.number().min(0),
  }),
  strategies: z.array(StrategyOutlook).min(1),
  /** Contexto de la región: datos de quién siembra y en qué condiciones, y preguntas para conversar. */
  context: z.object({
    region: z.enum(['co', 'global']),
    placeName: z.string().nullable(),
    facts: z
      .array(z.object({ id: z.string(), text: z.string().max(320), refIds: z.array(z.string()).max(4) }))
      .max(8),
    questions: z.array(z.string().max(200)).max(6),
  }),
  /** Lo que supusimos porque no lo sabemos (se muestra como "Lo que no sabemos"). */
  assumptions: z.array(z.string().max(280)),
  references: z.array(Reference),
  generatedAt: z.iso.datetime(),
  disclaimer: z.string(),
  mock: z.boolean().optional(),
});
export type OutlookResponse = z.infer<typeof OutlookResponse>;
