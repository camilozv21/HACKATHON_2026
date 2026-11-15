/**
 * Cliente del motor agronómico del equipo (FastAPI en Railway): `POST {MOTOR_API_URL}/api/v1/evaluaciones`.
 * Solo servidor: la URL y `MOTOR_API_KEY` (cabecera X-API-Key) nunca llegan al navegador.
 *
 * El motor valida la entrada con sus catálogos y responde 422 si algo no le sirve. Como el formato exacto de
 * `serie_nasa_power`, `historial` y `rastrojo` aún no está publicado, se prueba en escalera:
 *   1. todo (lat, lon, cultivo, etapa, campo, historial, rastrojo, serie_nasa_power)
 *   2. sin la serie diaria
 *   3. lo mínimo (lat, lon, cultivo, etapa)
 * y el plan dice cuál aceptó (`accepted`). Ver docs/motor-api.md.
 */
import { createHash } from 'node:crypto';
import type { MotorPlanBase, MotorPlanRequest } from '@/lib/api/motor';
import { ZONE_POWER_PARAMS } from './zone';

export type MotorLevel = MotorPlanBase['accepted'];
const LADDER: MotorLevel[] = ['full', 'no-series', 'minimal'];
const TIMEOUT_MS = 25_000;

export class MotorError extends Error {
  constructor(
    public kind: 'timeout' | 'network' | 'http' | 'invalid',
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'MotorError';
  }
}

export function motorConfig() {
  const url = process.env.MOTOR_API_URL?.trim().replace(/\/$/, '') ?? '';
  const forceMock = process.env.MOTOR_FORCE_MOCK?.trim() === 'true';
  return { url: forceMock ? '' : url, key: process.env.MOTOR_API_KEY?.trim() ?? '' };
}

/** Referencia anónima de la finca (el id lleva la geometría; al motor solo va un hash). */
export const clientRef = (fieldId: string) => `fieldshift:${createHash('sha256').update(fieldId).digest('hex').slice(0, 16)}`;

const compactDate = (d: string) => d.replaceAll('-', '');

/**
 * Serie diaria en el formato de la respuesta de NASA POWER (`properties.parameter.<PARAM>.<YYYYMMDD>`, −999 = hueco),
 * con los valores de la zona (máximo entre celdas). GWET va en fracción 0–1, como lo publica POWER.
 */
export function toPowerSeries(zone: MotorPlanRequest['zone']) {
  const pick: Record<(typeof ZONE_POWER_PARAMS)[number], (d: MotorPlanRequest['zone']['days'][number]) => number | null> = {
    T2M: (d) => d.t2m,
    T2M_MAX: (d) => d.tmax,
    T2M_MIN: (d) => d.tmin,
    RH2M: (d) => d.rh,
    PRECTOTCORR: (d) => d.precip,
    GWETROOT: (d) => (d.soilRoot == null ? null : d.soilRoot / 100),
    GWETTOP: (d) => (d.soilTop == null ? null : d.soilTop / 100),
    WS2M: (d) => d.wind,
    ALLSKY_SFC_SW_DWN: (d) => d.solar,
  };
  const parameter = Object.fromEntries(
    ZONE_POWER_PARAMS.map((p) => [p, Object.fromEntries(zone.days.map((d) => [compactDate(d.date), pick[p](d) ?? -999]))]),
  );
  const [lon, lat] = zone.center;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat, zone.summary.elevationM ?? -999] },
    properties: { parameter },
    header: {
      title: 'NASA/POWER daily, community AG — Field Shift: máximo por día entre las celdas del rectángulo de la finca',
      api: { name: 'POWER Daily API' },
      fill_value: -999,
      start: compactDate(zone.period.start),
      end: compactDate(zone.period.end),
      bbox: zone.bbox,
      cells: zone.powerCellsOk,
    },
  };
}

/** Cuerpo del POST según el escalón. Nunca se mandan valores de NASA POWER como si fueran medidos en el lote. */
export function buildPayload(req: MotorPlanRequest, level: MotorLevel) {
  const [lon, lat] = req.zone.center;
  const body: Record<string, unknown> = {
    lat,
    lon,
    referencia_cliente: clientRef(req.fieldId),
    ...(req.crop && { cultivo: req.crop }),
    ...(req.stage && { etapa: req.stage }),
  };
  if (level === 'minimal') return body;

  // `campo`: solo lo que la persona midió u observó en su lote.
  const campo: Record<string, unknown> = {};
  if (req.soil.ph != null) campo.soil_ph = req.soil.ph;
  if (req.soil.organicMatterPct != null) campo.organic_matter = req.soil.organicMatterPct;
  if (req.soil.texture) campo.soil_texture = req.soil.texture;
  if (req.symptoms.length) campo.symptoms = req.symptoms;
  if (Object.keys(campo).length) body.campo = campo;
  if (req.history.length) body.historial = req.history;
  if (req.residue) body.rastrojo = req.residue;
  if (level === 'full' && req.zone.days.length >= 7) body.serie_nasa_power = toPowerSeries(req.zone);
  return body;
}

async function post(url: string, key: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${url}/api/v1/evaluaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(key && { 'X-API-Key': key }) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw new MotorError('timeout', `El motor no respondió en ${TIMEOUT_MS / 1000} s`);
    throw new MotorError('network', (err as Error).message);
  }
}

/** Llama al motor bajando de escalón solo si responde 422 (entrada no válida). Devuelve el registro guardado. */
export async function evaluate(req: MotorPlanRequest): Promise<{ record: unknown; accepted: MotorLevel }> {
  const { url, key } = motorConfig();
  if (!url) throw new MotorError('network', 'MOTOR_API_URL no está configurada');
  // Sin serie ni datos del lote, los escalones 1 y 2 serían iguales al 3: se salta lo repetido.
  const tried = new Set<string>();
  let last: Response | null = null;
  for (const level of LADDER) {
    const body = buildPayload(req, level);
    const sig = JSON.stringify(body);
    if (tried.has(sig)) continue;
    tried.add(sig);
    const res = await post(url, key, body);
    if (res.ok) {
      try {
        return { record: await res.json(), accepted: level };
      } catch {
        throw new MotorError('invalid', 'La respuesta del motor no es JSON', res.status);
      }
    }
    last = res;
    if (res.status !== 422) break;
    // Solo dónde y por qué (FastAPI también repite el valor en `input`: eso no se registra).
    const detail = (await res.json().catch(() => null)) as { detail?: { loc?: unknown[]; msg?: string }[] } | null;
    const where = Array.isArray(detail?.detail) ? detail.detail.map((d) => `${(d.loc ?? []).join('.')}: ${d.msg ?? ''}`) : [];
    console.warn(`[motor] 422 con "${level}", pruebo con menos datos:`, where.slice(0, 5).join(' | '));
  }
  throw new MotorError('http', `El motor respondió ${last?.status ?? '?'}`, last?.status);
}
