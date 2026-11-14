'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useGlobeStore } from './store';

/**
 * Mira en el centro visible del mapa. No se queda fija en pantalla: aparece solo mientras la persona
 * mueve el globo (y se desvanece ~1 s después) o cuando hace falta apuntar (modo "poner pin").
 * Antes de que cargue el globo muestra el texto de carga, pintado desde el servidor (FCP/LCP).
 */
export function Crosshair({ forceVisible = false }: { forceVisible?: boolean }) {
  const t = useTranslations('globe');
  const map = useGlobeStore((s) => s.map);
  const status = useGlobeStore((s) => s.status);
  const [moving, setMoving] = useState(false);

  // Solo se escuchan inicio y fin del movimiento (nunca cada frame) y solo si lo inició la persona.
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onStart = (e: object) => {
      if (!(e as { originalEvent?: unknown }).originalEvent) return;
      if (timer) clearTimeout(timer);
      setMoving(true);
    };
    const onEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMoving(false), 1000);
    };
    map.on('movestart', onStart);
    map.on('moveend', onEnd);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('movestart', onStart);
      map.off('moveend', onEnd);
    };
  }, [map]);

  if (status === 'no-webgl') return null;

  if (status !== 'ready') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="map-center">
          <p className="glass rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap shadow-lg">{t('loadingHint')}</p>
        </div>
      </div>
    );
  }

  const visible = forceVisible || moving;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      <div className={clsx('map-center transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')}>
        <svg width="48" height="48" viewBox="0 0 56 56" className="drop-shadow-[0_0_6px_rgb(0_0_0/0.8)]">
          <circle cx="28" cy="28" r="14" fill="none" stroke="rgb(255 255 255 / 0.85)" strokeWidth="1.5" />
          <circle cx="28" cy="28" r="2" fill="rgb(159 240 184)" />
          <path d="M28 6v8M28 42v8M6 28h8M42 28h8" stroke="rgb(255 255 255 / 0.85)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
