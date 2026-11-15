/**
 * Pistas de la radio sobre el globo: cuando el locutor llega a una frase, la radio vuela al lugar, prende la capa
 * o abre el panel del que habla. Reutiliza el ejecutor de acciones del agente (mismo contrato y validaciones).
 *
 * - Si la persona toma el mapa (arrastra, busca un lugar, el asistente vuela), las pistas esperan hasta que toque
 *   "Seguir a la radio". Con "La radio mueve el mapa" apagado no se ejecuta ninguna.
 * - En el teléfono no se abre el panel de la región (taparía el reproductor): queda el botón "Ver la zona".
 * - Un vuelo a donde ya se está mirando se omite (no hay que mover la cámara por moverla).
 */
import { getMap } from '@/features/globe/store';
import type { AgentAction, RadioSegment } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import { useRadioLive } from './live';

let steering = false;
/** La cámara se está moviendo por una pista de la radio (no por la persona). */
export const radioSteering = () => steering;

let firedFor: RadioSegment | null = null;
let fired = new Set<number>();
let chain: Promise<void> = Promise.resolve();

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera a que la cámara quede quieta (abrir una región la hace volar un instante después). */
async function settle(timeoutMs = 6000) {
  await sleep(350);
  const map = getMap();
  if (!map?.isMoving()) return;
  await Promise.race([new Promise<void>((r) => map.once('moveend', () => r())), sleep(timeoutMs)]);
}

function alreadyThere(a: AgentAction) {
  if (a.type !== 'flyTo' || a.lat == null || a.lon == null) return false;
  const map = getMap();
  if (!map) return false;
  const c = map.getCenter();
  return haversineKm({ lng: c.lng, lat: c.lat }, { lng: a.lon, lat: a.lat }) < 35 && Math.abs(map.getZoom() - (a.zoom ?? map.getZoom())) < 2.5;
}

async function runOne(action: AgentAction) {
  const live = useRadioLive.getState();
  if (!live.follow || live.held) return;
  if (action.type === 'openRegion' && !isDesktop()) return;
  if (alreadyThere(action)) return;
  steering = true;
  try {
    const { runAgentActions } = await import('@/features/agent/actionRunner');
    await runAgentActions([action], { locale: document.documentElement.lang || 'es', messages: { noField: '' } });
    await settle();
  } catch {
    // Una pista que falla no corta la radio.
  } finally {
    steering = false;
  }
}

/** Ejecuta (en orden, una a la vez) las pistas del segmento hasta la frase `sentence` que aún no se ejecutaron. */
export function runCues(seg: RadioSegment, sentence: number) {
  if (firedFor !== seg) {
    firedFor = seg;
    fired = new Set();
  }
  seg.cues?.forEach((c, i) => {
    if (c.sentence > sentence || fired.has(i)) return;
    fired.add(i);
    chain = chain.then(() => runOne(c.action));
  });
}

/** "Seguir a la radio": vuelve a poner el mapa en lo que dice el segmento actual. */
export function resyncCues(seg: RadioSegment | null, sentence: number) {
  if (!seg) return;
  firedFor = null;
  runCues(seg, sentence);
}
