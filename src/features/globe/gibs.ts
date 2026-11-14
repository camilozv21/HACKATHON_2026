/**
 * NASA GIBS (Global Imagery Browse Services) — WMTS REST en EPSG:3857.
 * Identificadores, formatos y niveles verificados contra el GetCapabilities:
 * https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
 */
export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export type GibsFormat = 'jpeg' | 'png';

export type GibsLayerRef = {
  id: string;
  /** N de GoogleMapsCompatible_LevelN = zoom máximo con datos nativos */
  level: number;
  format: GibsFormat;
};

/** Mosaico sin nubes (MODIS). Sin dimensión de tiempo. */
export const BLUE_MARBLE: GibsLayerRef = { id: 'BlueMarble_NextGeneration', level: 8, format: 'jpeg' };

/**
 * Color real diario. Usamos NOAA-20 como principal porque, según el GetCapabilities de nov-2026,
 * VIIRS SNPP dejó de actualizarse (último día 2026-11-02). SNPP queda como respaldo.
 */
export const VIIRS_TRUECOLOR: GibsLayerRef = {
  id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  level: 9,
  format: 'jpeg',
};
export const VIIRS_TRUECOLOR_FALLBACK: GibsLayerRef = {
  id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  level: 9,
  format: 'jpeg',
};

export function gibsTileUrl(layer: GibsLayerRef, time: string | null): string {
  const timePart = time ? `${time}/` : '';
  return `${GIBS_BASE}/${layer.id}/default/${timePart}GoogleMapsCompatible_Level${layer.level}/{z}/{y}/{x}.${layer.format}`;
}

/** Fecha YYYY-MM-DD en UTC, `daysAgo` días antes de `now`. */
export function utcDate(daysAgo = 0, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return d.toISOString().slice(0, 10);
}

async function tileExists(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url.replace('{z}', '0').replace('{y}', '0').replace('{x}', '0'), {
      signal,
      cache: 'force-cache',
    });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * Resuelve la imagen de color real más reciente con cobertura completa:
 * ayer (UTC) → anteayer → misma búsqueda en el satélite de respaldo.
 */
export async function resolveTrueColor(signal?: AbortSignal): Promise<{ layer: GibsLayerRef; date: string }> {
  for (const layer of [VIIRS_TRUECOLOR, VIIRS_TRUECOLOR_FALLBACK]) {
    for (const daysAgo of [1, 2]) {
      const date = utcDate(daysAgo);
      if (await tileExists(gibsTileUrl(layer, date), signal)) return { layer, date };
    }
  }
  return { layer: VIIRS_TRUECOLOR, date: utcDate(2) };
}
