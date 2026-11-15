import { Bean, Shrub, Sprout, Trees, Wheat, type LucideIcon } from 'lucide-react';
import type { LevelId } from '@/lib/points';

/** Ícono de cada nivel: de la semilla al bosque (el nivel también se dice con texto, nunca solo con el ícono). */
export const LEVEL_ICONS: Record<LevelId, LucideIcon> = {
  semilla: Bean,
  brote: Sprout,
  raiz: Shrub,
  cosecha: Wheat,
  bosque: Trees,
};

export function LevelIcon({ level, className }: { level: LevelId; className?: string }) {
  const Icon = LEVEL_ICONS[level];
  return <Icon aria-hidden className={className} />;
}
