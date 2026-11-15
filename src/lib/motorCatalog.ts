/**
 * Catálogo del motor agronómico (claves que acepta `POST /api/v1/evaluaciones`) y cómo se traduce lo que la
 * persona contó en la app (cultivos, suelo, rastrojo) a esas claves. Los textos van en messages (`motor.*`).
 *
 * Origen: motor v2.1 + salida 4.1.0 del equipo (docs/motor-api.md). `GET /api/v1/catalogo` debería devolver lo
 * mismo; si cambia, se actualiza aquí.
 */
import type { CropId, CropSeason, FieldSurvey, SoilInfo } from '@/lib/api/contract';

/** Cultivo sembrado hoy (`cultivo`). */
export const MOTOR_CROPS = ['maiz', 'frijol', 'calabaza', 'caupi', 'platano', 'cana_panelera', 'tres_hermanas', 'otro'] as const;
export type MotorCrop = (typeof MOTOR_CROPS)[number];

/** Cultivos del historial (`historial`): los de arriba más la canavalia (abono verde). */
export const MOTOR_HISTORY_CROPS = ['maiz', 'frijol', 'calabaza', 'caupi', 'canavalia', 'platano', 'cana_panelera', 'otro'] as const;
export type MotorHistoryCrop = (typeof MOTOR_HISTORY_CROPS)[number];

/** Etapas (`etapa`): una lista para todos los cultivos. */
export const MOTOR_STAGES = ['establecimiento', 'vegetativo', 'floracion', 'fructificacion', 'llenado', 'maduracion'] as const;
export type MotorStage = (typeof MOTOR_STAGES)[number];

/** Síntomas que ve la persona (`campo.symptoms`) y a qué cultivos aplican (vacío = a todos). */
export const MOTOR_SYMPTOMS = [
  { id: 'clorosis_hojas_viejas', crops: [] },
  { id: 'necrosis_bordes_hojas_viejas', crops: [] },
  { id: 'clorosis_intervenal_hojas_viejas', crops: [] },
  { id: 'coloracion_violacea', crops: [] },
  { id: 'necrosis_puntos_crecimiento_frutos_jovenes', crops: [] },
  { id: 'clorosis_generalizada_hojas_jovenes', crops: [] },
  { id: 'bandas_cloroticas_entrenudos_cortos', crops: ['maiz', 'tres_hermanas'] },
  { id: 'amarillamiento_colapso_hojas_centrales', crops: ['platano'] },
] as const satisfies readonly { id: string; crops: readonly MotorCrop[] }[];
export type MotorSymptom = (typeof MOTOR_SYMPTOMS)[number]['id'];
export const MOTOR_SYMPTOM_IDS = MOTOR_SYMPTOMS.map((s) => s.id) as [MotorSymptom, ...MotorSymptom[]];

export const symptomsFor = (crop: MotorCrop | null) =>
  MOTOR_SYMPTOMS.filter((s) => s.crops.length === 0 || (crop != null && (s.crops as readonly string[]).includes(crop)));

/** Rastrojo (`rastrojo`): se reincorpora o se retira del lote. */
export const MOTOR_RESIDUES = ['incorporated', 'removed'] as const;
export type MotorResidue = (typeof MOTOR_RESIDUES)[number];

/** Texturas del motor (el valor es el texto en español). Limosa y "no sé" no tienen equivalente: no se mandan. */
export const MOTOR_TEXTURES = ['Arenosa', 'Franca', 'Arcillosa'] as const;
export type MotorTexture = (typeof MOTOR_TEXTURES)[number];

const TEXTURE: Partial<Record<SoilInfo['texture'], MotorTexture>> = { sandy: 'Arenosa', loam: 'Franca', clay: 'Arcillosa' };
export const motorTexture = (t: SoilInfo['texture'] | undefined) => (t ? (TEXTURE[t] ?? null) : null);

/** Cultivos de la app que el motor conoce; el resto cuenta como "otro". El barbecho no es un cultivo. */
const CROP: Partial<Record<CropId, MotorCrop>> = {
  maize: 'maiz',
  beans: 'frijol',
  squash: 'calabaza',
  cowpea: 'caupi',
  plantain: 'platano',
  sugarcane: 'cana_panelera',
};
export function motorCropOf(c: CropId | null | undefined): MotorCrop | null {
  if (!c || c === 'fallow' || c === 'shade-trees') return null;
  return CROP[c] ?? 'otro';
}

/** Un ciclo del historial: una asociación lleva varias claves (tres hermanas = maíz + fríjol + calabaza). */
export function historyCycle(c: MotorCrop | MotorHistoryCrop): MotorHistoryCrop[] {
  return c === 'tres_hermanas' ? ['maiz', 'frijol', 'calabaza'] : [c];
}

const PLANTED_ROLES = new Set<CropSeason['role']>(['cash', 'perennial', 'intercrop']);
const inSeason = (s: CropSeason, month: number) =>
  s.startMonth <= s.endMonth ? month >= s.startMonth && month <= s.endMonth : month >= s.startMonth || month <= s.endMonth;

/** Lo que está sembrado este mes según la rotación que contó la persona (el primero que el motor conoce). */
export function currentMotorCrop(seasons: readonly CropSeason[], month: number): MotorCrop | null {
  const now = seasons.filter((s) => (s.year ?? 1) === 1 && PLANTED_ROLES.has(s.role) && inSeason(s, month));
  const known = now.map((s) => motorCropOf(s.crop)).filter((c): c is MotorCrop => c != null);
  return known.find((c) => c !== 'otro') ?? known[0] ?? null;
}

/** Último cultivo (antes de lo de hoy): primero lo que contó en la encuesta; si no, la última temporada que terminó. */
export function lastMotorCrop(survey: FieldSurvey | null | undefined, seasons: readonly CropSeason[], month: number): MotorHistoryCrop | null {
  const fromSurvey = motorCropOf(survey?.lastCrop);
  if (fromSurvey) return fromSurvey === 'tres_hermanas' ? 'maiz' : fromSurvey;
  const ended = seasons
    .filter((s) => (s.year ?? 1) === 1 && PLANTED_ROLES.has(s.role) && !inSeason(s, month))
    // La que terminó más cerca de este mes (contando hacia atrás).
    .sort((a, b) => ((month - a.endMonth + 12) % 12) - ((month - b.endMonth + 12) % 12));
  for (const s of ended) {
    const c = motorCropOf(s.crop);
    if (c) return c === 'tres_hermanas' ? 'maiz' : c;
  }
  return null;
}

export function motorResidueOf(r: FieldSurvey['residues'] | undefined): MotorResidue | null {
  if (r === 'leave') return 'incorporated';
  if (r === 'remove' || r === 'burn' || r === 'graze') return 'removed';
  return null;
}
