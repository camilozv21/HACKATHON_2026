import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMockRegion } from '@/mocks/region';
import { persistQueries, restoreQueries } from './persist';

const KEY = 'fieldshift:queryCache:v1';
const regionKey = ['region', null, '4.50', '-75.70', null, 'es'] as const;
const region = () => buildMockRegion({ lat: 4.5, lon: -75.7, locale: 'es' } as Parameters<typeof buildMockRegion>[0], null);

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('caché persistente de consultas', () => {
  it('guarda una región y la restaura como vieja (se pinta y se vuelve a pedir)', async () => {
    vi.useFakeTimers();
    const a = new QueryClient();
    const stop = persistQueries(a);
    a.setQueryData(regionKey, region());
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    const saved = JSON.parse(window.localStorage.getItem(KEY)!) as { k: unknown[]; t: number }[];
    expect(saved).toHaveLength(1);
    expect(saved[0]!.k).toEqual(regionKey);

    const b = new QueryClient();
    restoreQueries(b);
    expect(b.getQueryData(regionKey)).toMatchObject({ cards: expect.any(Array) });
    const q = b.getQueryCache().find({ queryKey: regionKey, exact: true })!;
    expect(q.state.dataUpdatedAt).toBe(0);
    expect(q.isStaleByTime(15 * 60_000)).toBe(true);
  });

  it('descarta lo que ya no cumple el contrato, lo muy viejo y las consultas que no se persisten', () => {
    const now = Date.now();
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { k: regionKey, d: { cards: 'no es un arreglo' }, t: now },
        { k: ['region', null, '1.00', '1.00', null, 'es'], d: region(), t: now - 30 * 86_400_000 },
        { k: ['otra', 1], d: { x: 1 }, t: now },
      ]),
    );
    const c = new QueryClient();
    restoreQueries(c);
    expect(c.getQueryCache().getAll()).toHaveLength(0);
  });

  it('no se rompe con basura en localStorage', () => {
    window.localStorage.setItem(KEY, '{no-json');
    const c = new QueryClient();
    expect(() => restoreQueries(c)).not.toThrow();
    expect(c.getQueryCache().getAll()).toHaveLength(0);
  });
});
