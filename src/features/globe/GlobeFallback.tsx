'use client';

import { Loader2, MonitorX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGlobeStore } from './store';

/** Imagen estática del mundo (NASA GIBS WMS, Blue Marble) para equipos sin WebGL. */
const WORLD_2D =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1024&HEIGHT=512&FORMAT=image/jpeg';

/** Vista 2D con mensaje amable si no hay WebGL, y aviso mientras se recupera un contexto perdido. */
export function GlobeFallback() {
  const t = useTranslations('globe');
  const status = useGlobeStore((s) => s.status);

  if (status === 'context-lost') {
    return (
      <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-black/40">
        <p className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t('contextLost')}
        </p>
      </div>
    );
  }

  if (status !== 'no-webgl') return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen remota de NASA GIBS, sin optimizador */}
      <img
        src={WORLD_2D}
        alt={t('fallbackAlt')}
        width={1024}
        height={512}
        className="w-full max-w-3xl rounded-2xl border border-line object-cover opacity-90"
      />
      <div className="glass flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-left">
        <MonitorX aria-hidden className="mt-0.5 size-5 shrink-0 text-risk-medium" />
        <p className="text-sm">{t('noWebgl')}</p>
      </div>
    </div>
  );
}
