import { create } from 'zustand';

/** Términos del glosario. Textos en messages/<locale>.json → glossary.terms.<id>.{title, simple, example}. */
export const GLOSSARY_TERMS = [
  'ndvi',
  'et',
  'soil-moisture',
  'anomaly',
  'frost',
  'water-balance',
  'grace',
  'satellite-vs-field',
  'confidence',
  'rain',
  'lst',
  'heat',
  'slope',
  'legume',
  'cover-crop',
  'deep-roots',
  'drought-tolerant',
  'ph',
  'organic-matter',
  'intercropping',
  'strata',
  'workday',
  'break-even',
  'soil-loss',
  'wholesale-price',
  'price-volatility',
  'oversupply',
  'gross-income',
] as const;
export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];

export const TERM_ICONS: Record<GlossaryTerm, string> = {
  ndvi: 'Leaf',
  et: 'Wind',
  'soil-moisture': 'Droplets',
  anomaly: 'TrendingDown',
  frost: 'Snowflake',
  'water-balance': 'Scale',
  grace: 'Waves',
  'satellite-vs-field': 'Satellite',
  confidence: 'Gauge',
  rain: 'CloudRain',
  lst: 'Sun',
  heat: 'Thermometer',
  slope: 'Mountain',
  legume: 'Bean',
  'cover-crop': 'Sprout',
  'deep-roots': 'GitBranch',
  'drought-tolerant': 'Sun',
  ph: 'FlaskConical',
  'organic-matter': 'Shovel',
  intercropping: 'Combine',
  strata: 'Layers',
  workday: 'Sun',
  'break-even': 'Scale',
  'soil-loss': 'TrendingDown',
  'wholesale-price': 'Store',
  'price-volatility': 'Activity',
  'oversupply': 'Boxes',
  'gross-income': 'Coins',
};

/** Ids que usan otras partes de la app (capas, tarjetas) → término del glosario. */
export const TERM_ALIASES: Record<string, GlossaryTerm> = {
  ndvi: 'ndvi',
  'soil-moisture': 'soil-moisture',
  rain: 'rain',
  lst: 'lst',
  frost: 'frost',
  et: 'et',
  grace: 'grace',
  slope: 'slope',
  heat: 'heat',
};

type GlossaryState = { open: GlossaryTerm | null; show: (t: GlossaryTerm) => void; close: () => void };
export const useGlossaryStore = create<GlossaryState>()((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}));
