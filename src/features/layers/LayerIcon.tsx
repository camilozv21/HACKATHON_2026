import { CloudRain, Droplets, Leaf, Moon, Mountain, ShieldAlert, Sun, Waves, Wind, type LucideProps } from 'lucide-react';
import type { LayerConfig } from './layers.config';

const ICONS = { Leaf, Droplets, CloudRain, Sun, Moon, Wind, Waves, Mountain, ShieldAlert } as const;

export function LayerIcon({ name, ...props }: { name: LayerConfig['icon'] } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden {...props} />;
}
