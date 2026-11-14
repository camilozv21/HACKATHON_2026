/**
 * Qué datos le faltan al análisis de una finca. Lógica pura (sin React) para el panel, el chat y los tests.
 * El backend manda cuando responde `dataRequests`; si no, el cliente lo deduce de lo que envió.
 */
import { DATA_NEEDS, type CropSeason, type DataNeed, type DataRequest, type Level, type SoilInfo } from '@/lib/api/contract';

/** Suelo tal como lo cuenta el agricultor: cada dato es opcional y "no tengo análisis" también es respuesta. */
export type FarmSoil = Partial<SoilInfo> & { noTest?: boolean };

export type NeedState = {
  soil: FarmSoil | undefined;
  /** null = todavía usamos la rotación típica de la zona. */
  rotation: CropSeason[] | null;
  /** La persona ya dijo si tiene riego (en la tarjeta o en el asistente de prioridades). */
  irrigationKnown: boolean;
};

export type PendingNeed = { need: DataNeed; impact: Level; reason?: string; strategyIds?: string[] };

export const DEFAULT_IMPACT: Record<DataNeed, Level> = {
  'current-rotation': 'high',
  'soil-type': 'high',
  irrigation: 'high',
  drainage: 'medium',
  'soil-test': 'medium',
};

/** Datos de la finca que el cliente pide si el backend no dice nada (el riego se maneja aparte). */
const FIELD_NEEDS: DataNeed[] = ['current-rotation', 'soil-type', 'drainage', 'soil-test'];

export function isAnswered(need: DataNeed, s: NeedState): boolean {
  switch (need) {
    case 'soil-type':
      return s.soil?.texture !== undefined;
    case 'drainage':
      return s.soil?.drainage !== undefined;
    case 'soil-test':
      return s.soil?.ph !== undefined || s.soil?.organicMatterPct !== undefined || Boolean(s.soil?.noTest);
    case 'current-rotation':
      return s.rotation !== null;
    case 'irrigation':
      return s.irrigationKnown;
  }
}

/**
 * Datos que faltan, en el orden en que se preguntan (lo que más cambia la recomendación primero).
 * Lo que la persona ya respondió no se vuelve a pedir aunque el análisis anterior todavía lo pida.
 */
export function pendingNeeds(s: NeedState, backend?: readonly DataRequest[] | null): PendingNeed[] {
  const byNeed = new Map<DataNeed, PendingNeed>();
  if (backend) for (const r of backend) byNeed.set(r.need, { ...r });
  else for (const n of FIELD_NEEDS) byNeed.set(n, { need: n, impact: DEFAULT_IMPACT[n] });
  // El backend no distingue "no tengo riego" de "no me lo han preguntado": eso lo sabe el cliente.
  if (!byNeed.has('irrigation')) byNeed.set('irrigation', { need: 'irrigation', impact: DEFAULT_IMPACT.irrigation });
  return DATA_NEEDS.filter((n) => byNeed.has(n) && !isAnswered(n, s)).map((n) => byNeed.get(n)!);
}

/** Lo que la persona ya contó (para el resumen "tu análisis usa tus datos"). */
export function answeredNeeds(s: NeedState): DataNeed[] {
  return DATA_NEEDS.filter((n) => isAnswered(n, s));
}

/** Suelo del agricultor → entrada del contrato (sin datos de suelo, no se envía nada). */
export function toSoilInfo(s: FarmSoil | undefined): SoilInfo | undefined {
  if (!s) return undefined;
  const { texture, drainage, ph, organicMatterPct } = s;
  if (texture === undefined && drainage === undefined && ph === undefined && organicMatterPct === undefined) return undefined;
  return {
    texture: texture ?? 'unknown',
    ...(drainage !== undefined && { drainage }),
    ...(ph !== undefined && { ph }),
    ...(organicMatterPct !== undefined && { organicMatterPct }),
  };
}
