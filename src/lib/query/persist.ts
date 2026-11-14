import type { Query, QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { AnalysisResponse, ClimateProfile, RegionSummary } from '@/lib/api/contract';

/**
 * Caché de consultas que sobrevive a recargar la página (localStorage, siempre con try/catch).
 *
 * Al abrir de nuevo la app, una región, una finca o el clima ya vistos se pintan al instante con lo guardado,
 * en vez de esqueletos. Reglas:
 *  - `revalidate`: datos de nuestra API (o de los mocks, que cambian mientras se desarrolla). Lo guardado se
 *    muestra y se vuelve a pedir enseguida en segundo plano (como si fuera viejo).
 *  - Sin `revalidate`: datos de NASA POWER que no cambian (climatología 2001–año pasado); se respeta su staleTime.
 *  - Todo se valida con zod al restaurar: si el contrato cambió, lo guardado se descarta en silencio.
 */
const KEY = 'fieldshift:queryCache:v1';
/** ~300 KB con los límites de abajo; localStorage da ~5 MB por origen. */
const MAX_CHARS = 600_000;
const DAY = 86_400_000;
const SAVE_DELAY_MS = 1500;

type Rule = { max: number; maxAgeMs: number; revalidate: boolean; schema: z.ZodType };

const RULES: Record<string, Rule> = {
  region: { max: 20, maxAgeMs: 7 * DAY, revalidate: true, schema: RegionSummary },
  analysis: { max: 3, maxAgeMs: 3 * DAY, revalidate: true, schema: AnalysisResponse },
  power: { max: 8, maxAgeMs: 30 * DAY, revalidate: false, schema: ClimateProfile },
};

type Entry = { k: readonly unknown[]; d: unknown; t: number };

const ruleOf = (key: readonly unknown[]) => (typeof key[0] === 'string' ? RULES[key[0]] : undefined);

/** Momento real en que se obtuvo lo restaurado (las que se revalidan se restauran con dataUpdatedAt = 0). */
const restoredAt = new Map<string, number>();

function read(): Entry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

export function restoreQueries(client: QueryClient) {
  const now = Date.now();
  for (const e of read()) {
    if (!Array.isArray(e?.k) || typeof e.t !== 'number') continue;
    const rule = ruleOf(e.k);
    if (!rule || now - e.t > rule.maxAgeMs) continue;
    const ok = rule.schema.safeParse(e.d);
    if (!ok.success) continue;
    if (client.getQueryData(e.k) !== undefined) continue;
    client.setQueryData(e.k, ok.data, { updatedAt: rule.revalidate ? 0 : e.t });
    const q = client.getQueryCache().find({ queryKey: e.k, exact: true });
    if (q) restoredAt.set(q.queryHash, e.t);
  }
}

function collect(client: QueryClient): Entry[] {
  const byType = new Map<string, Entry[]>();
  for (const q of client.getQueryCache().getAll() as Query[]) {
    const rule = ruleOf(q.queryKey);
    if (!rule || q.state.status !== 'success' || q.state.data === undefined) continue;
    const t = q.state.dataUpdatedAt || restoredAt.get(q.queryHash) || 0;
    if (!t) continue;
    const type = q.queryKey[0] as string;
    const list = byType.get(type) ?? [];
    list.push({ k: q.queryKey, d: q.state.data, t });
    byType.set(type, list);
  }
  const out: Entry[] = [];
  for (const [type, list] of byType) {
    list.sort((a, b) => b.t - a.t);
    out.push(...list.slice(0, RULES[type]!.max));
  }
  return out.sort((a, b) => b.t - a.t);
}

function write(entries: Entry[]) {
  let list = entries;
  let json = JSON.stringify(list);
  // Si no cabe, se sueltan las más viejas.
  while (json.length > MAX_CHARS && list.length > 1) {
    list = list.slice(0, Math.ceil(list.length * 0.75));
    json = JSON.stringify(list);
  }
  try {
    window.localStorage.setItem(KEY, json);
  } catch {
    // Sin espacio o modo privado: mejor nada que algo a medias.
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nada */
    }
  }
}

/** Guarda (en un momento ocioso, agrupando varios cambios) cada vez que llega una respuesta nueva. */
export function persistQueries(client: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const run = () => write(collect(client));
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
    else run();
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (!ruleOf(event.query.queryKey)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  });
  // Al cerrar o pasar a segundo plano, guardar lo pendiente ya (en móvil la pestaña puede morir después).
  const flush = () => {
    if (document.visibilityState !== 'hidden' || !timer) return;
    clearTimeout(timer);
    timer = null;
    write(collect(client));
  };
  document.addEventListener('visibilitychange', flush);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', flush);
    if (timer) clearTimeout(timer);
  };
}
