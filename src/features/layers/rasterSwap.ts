import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Capa raster con doble búfer para cambiar de fecha o de capa sin "parches".
 *
 * Con `setTiles`, MapLibre reemplaza cada tesela por separado y sin fundido: durante un segundo se ve un mosaico
 * de la fecha vieja y la nueva. Aquí la versión nueva se carga invisible encima de la actual y, cuando sus teselas
 * del viewport están listas (o tras READY_TIMEOUT_MS), las dos se cruzan en `fadeMs`. Luego se borra la vieja.
 *
 * Ids: la primera versión de una capa usa `data-<id>` (lo buscan los e2e) y la siguiente `data-<id>-b`, alternando.
 */
const READY_TIMEOUT_MS = 2500;
/** Fundido tesela a tesela cuando no hay nada que cruzar (primera vez o teselas que llegan al moverse). */
const TILE_FADE_MS = 150;

type Slot = { id: string; key: string; url: string };
type Pending = Slot & { stop: () => void };

export type RasterSwapShow = {
  /** Capa lógica (ndvi, rain…): define los ids de MapLibre. */
  key: string;
  url: string;
  opacity: number;
  maxzoom?: number;
  attribution?: string;
  beforeId?: string;
  /** Duración del cruce; 0 con movimiento reducido. */
  fadeMs: number;
};

export class RasterSwap {
  private live: Slot | null = null;
  private pending: Pending | null = null;
  private retiring = new Map<string, ReturnType<typeof setTimeout>>();
  private opacity = 1;
  private visible = true;

  constructor(private readonly map: MapLibreMap) {}

  /** Fuente que define el estado de la capa (errores, "sin datos"): la que se carga o, si no hay cambio, la visible. */
  get targetSourceId() {
    return this.pending?.id ?? this.live?.id ?? null;
  }

  show(o: RasterSwapShow) {
    const map = this.map;
    this.opacity = o.opacity;
    if (this.pending && this.pending.url === o.url) return;
    if (this.live && this.live.url === o.url) {
      // Volvió a la que ya se ve antes de que terminara de cargar otra.
      this.dropPending();
      this.paint(this.live.id, 'raster-opacity', o.opacity);
      return;
    }
    this.dropPending();

    const base = `data-${o.key}`;
    const id = this.live?.id === base ? `${base}-b` : base;
    this.removeNow(id);
    map.addSource(id, {
      type: 'raster',
      tiles: [o.url],
      tileSize: 256,
      maxzoom: o.maxzoom,
      attribution: o.attribution,
    });
    const layout = { visibility: this.visible ? ('visible' as const) : ('none' as const) };

    if (!this.live) {
      map.addLayer(
        { id, type: 'raster', source: id, layout, paint: { 'raster-opacity': o.opacity, 'raster-fade-duration': TILE_FADE_MS } },
        o.beforeId,
      );
      this.live = { id, key: o.key, url: o.url };
      return;
    }

    // Encima de la actual e invisible: sus teselas se piden igual (opacidad 0 no es "oculta" para MapLibre).
    map.addLayer(
      {
        id,
        type: 'raster',
        source: id,
        layout,
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 0, delay: 0 } },
      },
      o.beforeId,
    );

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stop();
      this.promote(id, o.key, o.url, o.fadeMs);
    };
    const onData = (e: { sourceId?: string }) => {
      if (e.sourceId === id && map.getSource(id) && map.isSourceLoaded(id)) finish();
    };
    const timer = setTimeout(finish, READY_TIMEOUT_MS);
    const stop = () => {
      clearTimeout(timer);
      map.off('sourcedata', onData);
      map.off('idle', finish);
    };
    map.on('sourcedata', onData);
    map.on('idle', finish);
    this.pending = { id, key: o.key, url: o.url, stop };
  }

  setOpacity(v: number) {
    this.opacity = v;
    if (this.live) this.paint(this.live.id, 'raster-opacity', v);
  }

  /** Para la animación de 12 meses, que dibuja sus propios fotogramas. */
  setVisible(v: boolean) {
    this.visible = v;
    for (const s of [this.live, this.pending]) {
      if (s && this.map.getLayer(s.id)) this.map.setLayoutProperty(s.id, 'visibility', v ? 'visible' : 'none');
    }
  }

  clear() {
    // Primero los temporizadores: si el mapa ya se destruyó, quitar capas puede lanzar y no deben quedar vivos.
    this.pending?.stop();
    for (const t of this.retiring.values()) clearTimeout(t);
    const ids = [this.pending?.id, this.live?.id, ...this.retiring.keys()].filter((id): id is string => Boolean(id));
    this.pending = null;
    this.live = null;
    this.retiring.clear();
    for (const id of ids) this.removeNow(id);
  }

  private promote(id: string, key: string, url: string, fadeMs: number) {
    const old = this.live;
    this.pending = null;
    this.live = { id, key, url };
    if (!this.map.getLayer(id)) return;
    const transition = { duration: fadeMs, delay: 0 };
    this.paint(id, 'raster-opacity-transition', transition);
    this.paint(id, 'raster-opacity', this.opacity);
    this.paint(id, 'raster-fade-duration', TILE_FADE_MS);
    if (!old) return;
    this.paint(old.id, 'raster-opacity-transition', transition);
    this.paint(old.id, 'raster-opacity', 0);
    this.retiring.set(
      old.id,
      setTimeout(() => this.removeNow(old.id), fadeMs + 60),
    );
  }

  private dropPending() {
    if (!this.pending) return;
    this.pending.stop();
    this.removeNow(this.pending.id);
    this.pending = null;
  }

  private removeNow(id: string) {
    const t = this.retiring.get(id);
    if (t) clearTimeout(t);
    this.retiring.delete(id);
    if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource(id)) this.map.removeSource(id);
  }

  private paint(
    id: string,
    prop: Parameters<MapLibreMap['setPaintProperty']>[1],
    value: Parameters<MapLibreMap['setPaintProperty']>[2],
  ) {
    if (this.map.getLayer(id)) this.map.setPaintProperty(id, prop, value);
  }
}
