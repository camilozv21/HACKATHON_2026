import type { Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterSwap } from './rasterSwap';

/** Lo mínimo de MapLibre que usa RasterSwap. */
function fakeMap() {
  const sources = new Map<string, { tiles: string[] }>();
  const layers = new Map<string, { paint: Record<string, unknown>; visibility: string }>();
  const order: string[] = [];
  const handlers = new Map<string, Set<(e: { sourceId?: string }) => void>>();
  const loaded = new Set<string>();
  const map = {
    addSource: (id: string, spec: { tiles: string[] }) => {
      if (sources.has(id)) throw new Error(`fuente repetida ${id}`);
      sources.set(id, spec);
    },
    getSource: (id: string) => sources.get(id),
    removeSource: (id: string) => sources.delete(id),
    addLayer: (spec: { id: string; paint?: Record<string, unknown>; layout?: { visibility?: string } }) => {
      layers.set(spec.id, { paint: { ...spec.paint }, visibility: spec.layout?.visibility ?? 'visible' });
      order.push(spec.id);
    },
    getLayer: (id: string) => layers.get(id),
    removeLayer: (id: string) => {
      layers.delete(id);
      order.splice(order.indexOf(id), 1);
    },
    setPaintProperty: (id: string, k: string, v: unknown) => {
      layers.get(id)!.paint[k] = v;
    },
    setLayoutProperty: (id: string, _k: string, v: string) => {
      layers.get(id)!.visibility = v;
    },
    on: (type: string, fn: (e: { sourceId?: string }) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
    },
    off: (type: string, fn: (e: { sourceId?: string }) => void) => handlers.get(type)?.delete(fn),
    isSourceLoaded: (id: string) => loaded.has(id),
  };
  return {
    map: map as unknown as MapLibreMap,
    layers,
    order,
    /** Simula que las teselas de una fuente terminaron de cargar. */
    load(id: string) {
      loaded.add(id);
      for (const fn of [...(handlers.get('sourcedata') ?? [])]) fn({ sourceId: id });
    },
    listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  };
}

const show = (url: string, extra: Partial<Parameters<RasterSwap['show']>[0]> = {}) => ({
  key: 'ndvi',
  url,
  opacity: 0.8,
  fadeMs: 300,
  ...extra,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RasterSwap: cambiar de fecha sin parches', () => {
  it('la primera vez agrega data-<capa> visible, con fundido por tesela', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://a'));
    expect(f.order).toEqual(['data-ndvi']);
    expect(f.layers.get('data-ndvi')!.paint['raster-opacity']).toBe(0.8);
    expect(swap.targetSourceId).toBe('data-ndvi');
  });

  it('una fecha nueva carga invisible encima y cruza cuando sus teselas están listas', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.show(show('gibs://jul'));
    expect(f.order).toEqual(['data-ndvi', 'data-ndvi-b']);
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity']).toBe(0);
    expect(f.layers.get('data-ndvi')!.paint['raster-opacity']).toBe(0.8);
    expect(swap.targetSourceId).toBe('data-ndvi-b');

    f.load('data-ndvi-b');
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity']).toBe(0.8);
    expect(f.layers.get('data-ndvi')!.paint['raster-opacity']).toBe(0);
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity-transition']).toEqual({ duration: 300, delay: 0 });

    vi.advanceTimersByTime(400);
    expect(f.order).toEqual(['data-ndvi-b']);
    expect(f.listeners()).toBe(0);

    // La siguiente vuelve a usar data-ndvi.
    swap.show(show('gibs://ago'));
    expect(f.order).toEqual(['data-ndvi-b', 'data-ndvi']);
  });

  it('si las teselas no terminan, cruza igual a los 2,5 s', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.show(show('gibs://jul'));
    vi.advanceTimersByTime(2499);
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity']).toBe(0);
    vi.advanceTimersByTime(1);
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity']).toBe(0.8);
  });

  it('volver a la fecha visible antes de que cargue la otra cancela el cambio', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.show(show('gibs://jul'));
    swap.show(show('gibs://sept'));
    expect(f.order).toEqual(['data-ndvi']);
    expect(swap.targetSourceId).toBe('data-ndvi');
    expect(f.listeners()).toBe(0);
  });

  it('la opacidad elegida mientras carga se aplica al cruzar', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.show(show('gibs://jul'));
    swap.show(show('gibs://jul', { opacity: 0.4 }));
    f.load('data-ndvi-b');
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity']).toBe(0.4);
  });

  it('con movimiento reducido el cambio es instantáneo (sin transición)', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept', { fadeMs: 0 }));
    swap.show(show('gibs://jul', { fadeMs: 0 }));
    f.load('data-ndvi-b');
    expect(f.layers.get('data-ndvi-b')!.paint['raster-opacity-transition']).toEqual({ duration: 0, delay: 0 });
  });

  it('clear quita todo y no deja temporizadores ni escuchas', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.show(show('gibs://jul'));
    swap.clear();
    expect(f.order).toEqual([]);
    expect(f.listeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(swap.targetSourceId).toBeNull();
  });

  it('setVisible oculta la capa (animación de 12 meses) y las nuevas nacen ocultas', () => {
    const f = fakeMap();
    const swap = new RasterSwap(f.map);
    swap.show(show('gibs://sept'));
    swap.setVisible(false);
    expect(f.layers.get('data-ndvi')!.visibility).toBe('none');
    swap.show(show('gibs://jul'));
    expect(f.layers.get('data-ndvi-b')!.visibility).toBe('none');
  });
});
