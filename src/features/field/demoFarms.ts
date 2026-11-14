import { fieldFromRing } from './geometry';
import type { LngLatTuple, SelectedField } from './types';

/**
 * Fincas demo en regiones agrícolas reales para el jurado. Los contornos son ilustrativos
 * (rectángulos sobre zonas de cultivo), no linderos reales.
 */
export type DemoFarm = {
  id: string;
  name: { es: string; en: string };
  region: { es: string; en: string };
  center: LngLatTuple;
  /** Ancho y alto aproximados de la parcela en metros, y rotación en grados. */
  size: [number, number];
  rotation?: number;
  zoom: number;
  /** Pista corta de por qué es interesante (se muestra en el punto). */
  hook: { es: string; en: string };
};

export const DEMO_FARMS: DemoFarm[] = [
  {
    id: 'cafe-quindio',
    name: { es: 'Finca cafetera (demo)', en: 'Coffee farm (demo)' },
    region: { es: 'Quindío, Colombia', en: 'Quindío, Colombia' },
    center: [-75.7748, 4.5352],
    size: [520, 480],
    rotation: 18,
    zoom: 15,
    hook: { es: 'Laderas, lluvias fuertes y erosión', en: 'Slopes, heavy rain and erosion' },
  },
  {
    id: 'cornbelt-iowa',
    name: { es: 'Granja de maíz y soya (demo)', en: 'Corn & soybean farm (demo)' },
    region: { es: 'Iowa, EE. UU. (Corn Belt)', en: 'Iowa, USA (Corn Belt)' },
    center: [-93.5232, 42.0318],
    size: [800, 800],
    zoom: 14,
    hook: { es: 'Suelo desnudo en invierno', en: 'Bare soil in winter' },
  },
  {
    id: 'punjab-ludhiana',
    name: { es: 'Finca de arroz y trigo (demo)', en: 'Rice & wheat farm (demo)' },
    region: { es: 'Punjab, India', en: 'Punjab, India' },
    center: [75.7468, 30.8521],
    size: [260, 220],
    rotation: 8,
    zoom: 16,
    hook: { es: 'Agua subterránea en descenso', en: 'Falling groundwater' },
  },
  {
    id: 'sahel-maradi',
    name: { es: 'Parcela de mijo (demo)', en: 'Millet plot (demo)' },
    region: { es: 'Maradi, Níger (Sahel)', en: 'Maradi, Niger (Sahel)' },
    center: [7.0581, 13.4462],
    size: [420, 380],
    rotation: -12,
    zoom: 15,
    hook: { es: 'Lluvias cortas y calor extremo', en: 'Short rains and extreme heat' },
  },
  {
    id: 'pampa-pergamino',
    name: { es: 'Campo de soya y trigo (demo)', en: 'Soy & wheat field (demo)' },
    region: { es: 'Pergamino, Argentina (Pampa)', en: 'Pergamino, Argentina (Pampas)' },
    center: [-60.6194, -33.9512],
    size: [1000, 700],
    rotation: 32,
    zoom: 14,
    hook: { es: 'Rotación soya–trigo y sequías', en: 'Soy–wheat rotation and droughts' },
  },
];

/** Rectángulo rotado de `w`×`h` metros alrededor de un centro. */
function rectangle([lng, lat]: LngLatTuple, [w, h]: [number, number], rotationDeg = 0): LngLatTuple[] {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const r = (rotationDeg * Math.PI) / 180;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => {
    const xr = x! * Math.cos(r) - y! * Math.sin(r);
    const yr = x! * Math.sin(r) + y! * Math.cos(r);
    return [lng + xr / mPerDegLng, lat + yr / mPerDegLat] as LngLatTuple;
  });
}

export function demoField(demo: DemoFarm, locale: string): SelectedField {
  const name = locale === 'en' ? demo.name.en : demo.name.es;
  return { ...fieldFromRing(rectangle(demo.center, demo.size, demo.rotation), 'demo', name), demoId: demo.id };
}

export function demoFieldsById(locale: string): Record<string, SelectedField> {
  return Object.fromEntries(DEMO_FARMS.map((d) => [d.id, demoField(d, locale)]));
}

export const getDemo = (id: string | undefined) => DEMO_FARMS.find((d) => d.id === id);
