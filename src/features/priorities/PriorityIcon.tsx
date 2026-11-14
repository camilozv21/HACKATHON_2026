import { Beef, Coins, Droplets, Mountain, Sprout, Tractor, type LucideIcon } from 'lucide-react';
import type { PriorityKey } from './ranking';

const ICONS: Record<PriorityKey, LucideIcon> = {
  waterSaving: Droplets,
  soilHealth: Sprout,
  income: Coins,
  forage: Beef,
  erosionControl: Mountain,
  laborEquipment: Tractor,
};

export function PriorityIcon({ id, className }: { id: PriorityKey; className?: string }) {
  const Icon = ICONS[id];
  return <Icon aria-hidden className={className} />;
}
