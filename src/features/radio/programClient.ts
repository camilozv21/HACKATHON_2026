/**
 * Programa del día en el cliente: lo pide para la emisora sintonizada y lo pone en la cola de la radio.
 *  1. Primero el guion de plantillas (`quick`, 1–3 s): la radio empieza a hablar enseguida.
 *  2. Si Claude puede mejorarlo (`pending`) y la persona sigue en la emisora a los 4 s, se pide la versión de Claude
 *     y se cambian los bloques que aún no sonaron.
 * Una sola petición por emisora; cambiar de emisora cancela la anterior.
 */
import { agentProfile } from '@/features/onboarding/profile';
import { RadioProgramResponse, type RadioSegment, type RadioStation } from '@/lib/api/contract';
import { usePrefsStore } from '@/lib/prefs';
import { radioEngine } from './engine';
import { useRadioLive } from './live';
import { useRadioStore } from './store';

let ctrl: AbortController | null = null;
let inflight: { stationId: string; base: Promise<void> } | null = null;

/** Bloques cuyo texto escribió Claude (el resto, las plantillas). La UI lo dice en cada bloque. */
export const writtenByClaude = new WeakSet<RadioSegment>();
const mark = (p: RadioProgramResponse) => {
  if (p.by === 'claude') p.segments.forEach((s) => writtenByClaude.add(s));
};

function programUrl(station: RadioStation, quick: boolean) {
  const { mode, units } = usePrefsStore.getState();
  const p = new URLSearchParams({
    lat: station.lat!.toFixed(3),
    lon: station.lon!.toFixed(3),
    locale: document.documentElement.lang === 'en' ? 'en' : 'es',
    mode,
    units,
  });
  if (station.local) p.set('name', station.region);
  else p.set('station', station.id);
  const role = agentProfile().role;
  if (role) p.set('role', role);
  if (quick) p.set('quick', '1');
  return `/api/radio/program?${p}`;
}

async function fetchProgram(station: RadioStation, quick: boolean, signal: AbortSignal) {
  const res = await fetch(programUrl(station, quick), { signal });
  if (!res.ok) throw new Error(`program_${res.status}`);
  return RadioProgramResponse.parse(await res.json());
}

/** Mete el programa en la cola: delante si la radio aún no suena, justo después del segmento actual si ya suena. */
export function placeProgram(segments: RadioSegment[], sounding: boolean) {
  const s = useRadioStore.getState();
  const have = new Set(s.segments.map((x) => x.id));
  const fresh = segments.filter((x) => !have.has(x.id));
  if (!fresh.length) return;
  const at = sounding ? s.index + 1 : s.index;
  s.setSegments([...s.segments.slice(0, at), ...fresh, ...s.segments.slice(at)]);
}

/** Cambia por la versión de Claude los bloques que todavía no sonaron (mismo id = mismo tema). */
export function upgradeProgram(segments: RadioSegment[], sounding: boolean) {
  const s = useRadioStore.getState();
  const byId = new Map(segments.map((x) => [x.id, x]));
  const first = sounding ? s.index + 1 : s.index;
  s.setSegments(s.segments.map((x, i) => (i >= first ? (byId.get(x.id) ?? x) : x)));
}

/**
 * Pide el programa de la emisora sintonizada. Devuelve una promesa que se cumple cuando el primer guion ya está en
 * la cola (la mejora con Claude sigue sola), o null si no hay nada que esperar (ya está, o la emisora no tiene lugar).
 */
export function ensureProgram(): Promise<void> | null {
  const { station } = useRadioStore.getState();
  if (!station || station.lat == null || station.lon == null) return null;
  const live = useRadioLive.getState();
  if (live.program.stationId === station.id && live.program.status === 'ready') return null;
  if (inflight?.stationId === station.id && live.program.status === 'loading') return inflight.base;

  ctrl?.abort();
  const c = new AbortController();
  ctrl = c;
  const id = station.id;
  const still = () => useRadioStore.getState().tunedId === id && !c.signal.aborted;
  live.setProgram({ stationId: id, status: 'loading', by: null, pending: false });

  const base = (async () => {
    try {
      const p = await fetchProgram(station, true, c.signal);
      if (!still()) return;
      // El servidor conoce mejor el nombre del lugar (municipio de Colombia).
      if (station.local && p.station.id === id) useRadioStore.getState().setStation({ ...station, name: p.station.name, region: p.place });
      mark(p);
      placeProgram(p.segments, radioEngine.isSounding());
      useRadioLive.getState().setProgram({ status: 'ready', by: p.by, pending: Boolean(p.pending) });
      if (p.pending) void upgrade(station, c);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || !still()) return;
      useRadioLive.getState().setProgram({ status: 'error', pending: false });
    }
  })();
  inflight = { stationId: id, base };
  return base;
}

/** Claude solo escribe si la persona se queda en la emisora: no se gasta IA en cada emisora que cruza el globo. */
const UPGRADE_DWELL_MS = 4000;

async function upgrade(station: RadioStation, c: AbortController) {
  await new Promise((r) => setTimeout(r, UPGRADE_DWELL_MS));
  if (c.signal.aborted || useRadioStore.getState().tunedId !== station.id) return;
  try {
    const p = await fetchProgram(station, false, c.signal);
    if (c.signal.aborted || useRadioStore.getState().tunedId !== station.id) return;
    mark(p);
    if (p.by === 'claude') upgradeProgram(p.segments, radioEngine.isSounding());
    useRadioLive.getState().setProgram({ by: p.by, pending: false });
  } catch {
    if (!c.signal.aborted) useRadioLive.getState().setProgram({ pending: false });
  }
}

/** Cambio de emisora: se corta lo que se estuviera pidiendo para la anterior. */
export function cancelProgram() {
  ctrl?.abort();
  ctrl = null;
  inflight = null;
}
