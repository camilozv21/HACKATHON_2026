'use client';

import { useUnits } from '@/lib/units';

/** Área con la unidad elegida (ha o acres). */
export function Area({ ha }: { ha: number }) {
  const u = useUnits();
  return <>{u.area(ha)}</>;
}
