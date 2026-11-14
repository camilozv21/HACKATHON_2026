import { env } from '@/lib/env';
import { lngLatToTile } from '@/lib/geo';
import type { CameraTarget } from './camera';
import { CROSSFADE, satelliteTileTemplate } from './style';

const MAX_TILES = 24;
const inflight = new Set<string>();

/**
 * Al iniciar un vuelo, calienta la caché HTTP con los tiles satelitales del destino a zoom final.
 * Solo tiene sentido para la satelital (Esri/MapTiler cachean); GIBS responde `no-store`.
 */
export function prefetchDestination(target: CameraTarget & { zoom: number }, viewport: { w: number; h: number }) {
  if (target.zoom < CROSSFADE.start) return;
  const { url, tileSize, maxzoom } = satelliteTileTemplate(env.maptilerKey);
  // MapLibre pide tiles de 256 px un nivel por encima del zoom del mapa.
  const z = Math.min(Math.floor(target.zoom) + (tileSize === 256 ? 1 : 0), maxzoom);
  // Un tile de nivel z ocupa 512·2^(zoom−z) px CSS, sin importar su tamaño en píxeles.
  const displayPx = 512 * 2 ** (target.zoom - z);
  const nx = Math.min(Math.ceil(viewport.w / displayPx) + 1, 6);
  const ny = Math.min(Math.ceil(viewport.h / displayPx) + 1, 6);
  const c = lngLatToTile(target.lng, target.lat, z);
  const n = 2 ** z;

  const urls: string[] = [];
  for (let dy = -Math.floor(ny / 2); dy <= Math.ceil(ny / 2); dy++) {
    for (let dx = -Math.floor(nx / 2); dx <= Math.ceil(nx / 2); dx++) {
      const x = (((c.x + dx) % n) + n) % n;
      const y = c.y + dy;
      if (y < 0 || y >= n) continue;
      urls.push(url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
  }

  for (const u of urls.slice(0, MAX_TILES)) {
    if (inflight.has(u)) continue;
    inflight.add(u);
    fetch(u, { mode: 'cors', credentials: 'omit', priority: 'low' } as RequestInit)
      .catch(() => undefined)
      .finally(() => inflight.delete(u));
  }
}
