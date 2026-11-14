export type LngLatTuple = [number, number];

export type FieldGeometry =
  | { type: 'Point'; coordinates: LngLatTuple }
  | { type: 'Polygon'; coordinates: LngLatTuple[][] };

export type FieldSource = 'pin' | 'polygon' | 'location' | 'demo' | 'url' | 'recent';

export type SelectedField = {
  /** Estable para la misma geometría: sirve de clave de caché y para compartir. */
  id: string;
  name: string | null;
  geometry: FieldGeometry;
  areaHa: number | null;
  center: LngLatTuple;
  source: FieldSource;
  demoId?: string;
};

export type FieldMode = 'idle' | 'choose' | 'pin' | 'draw';
export type SheetSnap = 'peek' | 'half' | 'full';
