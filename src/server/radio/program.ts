/**
 * Programa del día de la radio para un punto: datos (facts.ts) → guion de plantillas (script.ts) → Claude lo
 * reescribe con voz de locutor (claudeScript.ts). Solo servidor.
 *
 * Con `quick`, responde enseguida con el guion de plantillas (pending: true si Claude puede mejorarlo); la petición
 * sin `quick` hace que Claude lo escriba. Así la radio empieza a sonar en 1–3 s y no en 10–20 s.
 * El guion de Claude se guarda una hora por emisora, idioma, perfil y unidades (una llamada por combinación).
 */
import Anthropic from '@anthropic-ai/sdk';
import { getTranslations } from 'next-intl/server';
import { localCell, localStation } from '@/features/radio/local';
import type { HazardKind, RadioProgramResponse, RadioSegment, RadioStation } from '@/lib/api/contract';
import type { ProductId } from '@/lib/market/catalog';
import data from '@/mocks/radio.json';
import { claudeRadioEnabled, rewriteWithClaude } from './claudeScript';
import { gatherFacts, type Loc } from './facts';
import { rulesProgram, type ScriptOpts } from './script';

export type ProgramQuery = {
  lat: number;
  lon: number;
  name?: string | null;
  /** Emisora del mock con ubicación (quindio, cornbelt…). Sin ella, la emisora de la zona del punto. */
  stationId?: string | null;
  locale: Loc;
  role?: 'farmer' | 'technician';
  mode: 'lite' | 'full';
  units: 'metric' | 'imperial';
  quick?: boolean;
  now?: Date;
};

export type ProgramResult = { program: RadioProgramResponse };

const HOUR = 3_600_000;

/** Guiones de Claude ya escritos (o en curso), una hora. Un error no se queda guardado. */
const claudeCache = new Map<string, { at: number; value: Promise<RadioSegment[]> }>();
function peekClaude(key: string) {
  const hit = claudeCache.get(key);
  return hit && Date.now() - hit.at < HOUR ? hit.value : null;
}
function claudeOnce(key: string, make: () => Promise<RadioSegment[]>) {
  const hit = peekClaude(key);
  if (hit) return hit;
  const value = make();
  claudeCache.set(key, { at: Date.now(), value });
  value.catch(() => claudeCache.get(key)?.value === value && claudeCache.delete(key));
  if (claudeCache.size > 300) claudeCache.delete(claudeCache.keys().next().value!);
  return value;
}

function fixedStation(id: string | null | undefined): RadioStation | null {
  if (!id) return null;
  const s = (data.stations as RadioStation[]).find((x) => x.id === id);
  return s && s.lat != null && s.lon != null ? s : null;
}

async function names(locale: Loc): Promise<ScriptOpts['names']> {
  const [tp, te] = await Promise.all([
    getTranslations({ locale, namespace: 'products' }),
    getTranslations({ locale, namespace: 'events.kind' }),
  ]);
  return {
    product: (id: ProductId) => (tp.has(id) ? tp(id) : id),
    hazard: (kind: HazardKind) => (te.has(kind) ? te(kind) : kind),
  };
}

export async function buildProgram(q: ProgramQuery): Promise<ProgramResult> {
  const now = q.now ?? new Date();
  const fixed = fixedStation(q.stationId);
  const point = fixed ? { lat: fixed.lat!, lon: fixed.lon! } : localCell(q.lat, q.lon);
  const name = fixed ? fixed.region : q.name?.trim() || null;

  const facts = await gatherFacts({ ...point, name, locale: q.locale, now });
  const station = fixed ?? localStation(point.lat, point.lon, facts.place, q.locale);
  const opts: ScriptOpts = {
    locale: q.locale,
    units: q.units,
    mode: q.mode,
    role: q.role,
    stationId: station.id,
    stationName: station.name,
    names: await names(q.locale),
    now,
  };
  const draft = rulesProgram(facts, opts);
  const base: RadioProgramResponse = {
    station,
    place: facts.place,
    segments: draft,
    generatedAt: now.toISOString(),
    by: 'rules',
  };
  if (!claudeRadioEnabled()) return { program: base };

  const key = `radio:claude:${station.id}:${facts.today}:${now.toISOString().slice(11, 13)}:${q.locale}:${q.role ?? '-'}:${q.mode}:${q.units}`;
  const withClaude = (segments: RadioSegment[]): RadioProgramResponse => ({ ...base, segments, by: 'claude' });

  if (q.quick) {
    // Si ya estaba escrito (promesa resuelta antes de un tic), se usa. Si no, sale el de plantillas y `pending`
    // invita a pedirlo: Claude solo escribe cuando la persona se queda en la emisora (el cliente espera unos
    // segundos), no por cada emisora que cruza al pasear por el globo.
    const cached = peekClaude(key);
    const ready = cached ? await Promise.race([cached.catch(() => null), new Promise<undefined>((r) => setTimeout(() => r(undefined), 0))]) : null;
    return { program: ready ? withClaude(ready) : { ...base, pending: true } };
  }
  try {
    const segments = await claudeOnce(key, async () => {
      const r = await rewriteWithClaude(draft, { locale: q.locale, role: q.role, mode: q.mode });
      if (r.replaced === 0) throw new Error('claude_no_rewrite');
      return r.segments;
    });
    return { program: withClaude(segments) };
  } catch (err) {
    // Solo el tipo y el estado: nunca la clave ni el guion.
    const status = err instanceof Anthropic.APIError ? err.status : '';
    console.warn('[radio] Claude no reescribió el programa, queda el de plantillas', (err as Error).name, (err as Error).message.slice(0, 40), status);
    return { program: base };
  }
}
