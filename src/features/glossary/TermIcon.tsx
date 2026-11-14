/** Ícono de cada término del glosario (sirve en servidor y en cliente). */
import {
  Activity,
  Bean,
  BookOpen,
  Boxes,
  CloudRain,
  Coins,
  Combine,
  Droplets,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  Leaf,
  Mountain,
  Satellite,
  Scale,
  Shovel,
  Snowflake,
  Sprout,
  Store,
  Sun,
  Thermometer,
  TrendingDown,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { TERM_ICONS, type GlossaryTerm } from './terms';

const ICONS: Record<string, LucideIcon> = {
  Leaf,
  Wind,
  Droplets,
  TrendingDown,
  Snowflake,
  Scale,
  Waves,
  Satellite,
  Gauge,
  CloudRain,
  Sun,
  Thermometer,
  Mountain,
  Bean,
  Sprout,
  GitBranch,
  FlaskConical,
  Shovel,
  Combine,
  Layers,
  Store,
  Activity,
  Boxes,
  Coins,
};

export function TermIcon({ term, className }: { term: GlossaryTerm; className?: string }) {
  const Icon = ICONS[TERM_ICONS[term]] ?? BookOpen;
  return <Icon aria-hidden className={className} />;
}

/** Ficha de un término: frase simple, ejemplo del campo e ícono. Hoja modal accesible (Esc cierra). */
