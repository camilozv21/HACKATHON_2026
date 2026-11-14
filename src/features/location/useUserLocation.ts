'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from '@/components/ui/toast';
import { flyTo } from '@/features/globe/camera';
import { GeoError, requestPrecisePosition } from './precise';
import { selectUserLocation, useLocationStore } from './store';

export const USER_ZOOM = { ip: 5, precise: 12.5 } as const;

export function useUserLocation() {
  const { coarse, precise, permission, status } = useLocationStore(
    useShallow((s) => ({ coarse: s.coarse, precise: s.precise, permission: s.permission, status: s.status })),
  );
  return { location: selectUserLocation({ coarse, precise }), coarse, precise, permission, status };
}

/** Pide la ubicación precisa (tras un toque), vuela allí y explica con calma si algo falla. */
export function useLocateUser() {
  const t = useTranslations('location');
  return useCallback(async () => {
    try {
      const p = await requestPrecisePosition();
      useLocationStore.getState().markFlown();
      flyTo({ lng: p.lon, lat: p.lat, zoom: USER_ZOOM.precise });
      return { lng: p.lon, lat: p.lat };
    } catch (err) {
      const code = err instanceof GeoError ? err.code : 'unavailable';
      toast(t(`errors.${code}`), 'warning', 9000);
      const coarse = useLocationStore.getState().coarse;
      if (coarse && code !== 'denied') flyTo({ lng: coarse.lon, lat: coarse.lat, zoom: USER_ZOOM.ip });
      return null;
    }
  }, [t]);
}
