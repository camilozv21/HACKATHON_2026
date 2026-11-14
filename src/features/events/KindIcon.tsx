import { Activity, AlertCircle, CloudLightning, Flame, Mountain, MountainSnow, Shovel, Snowflake, Sun, Waves, type LucideProps } from 'lucide-react';
import type { HazardKind } from '@/lib/api/contract';
import { GROUP_COLOR, KIND_GROUP } from './kinds';

const ICON: Record<HazardKind, React.ComponentType<LucideProps>> = {
  landslide: Mountain,
  flood: Waves,
  storm: CloudLightning,
  wildfire: Flame,
  drought: Sun,
  frost: Snowflake,
  erosion: Shovel,
  earthquake: Activity,
  volcano: MountainSnow,
  other: AlertCircle,
};

export function KindIcon({ kind, ...props }: { kind: HazardKind } & LucideProps) {
  const Icon = ICON[kind];
  return <Icon aria-hidden {...props} />;
}

/** Ícono del tipo dentro de un círculo del color de su grupo; anillo si es un reporte de la comunidad. */
export function KindBadge({ kind, ring = false, size = 'md' }: { kind: HazardKind; ring?: boolean; size?: 'sm' | 'md' }) {
  const color = GROUP_COLOR[KIND_GROUP[kind]];
  const box = size === 'sm' ? 'size-8' : 'size-11';
  return (
    <span
      aria-hidden
      className={`grid ${box} shrink-0 place-items-center rounded-full`}
      style={ring ? { boxShadow: `inset 0 0 0 2.5px ${color}`, color } : { background: color, color: '#05070d' }}
    >
      <KindIcon kind={kind} className={size === 'sm' ? 'size-4' : 'size-5'} />
    </span>
  );
}
