'use client';

import clsx from 'clsx';
import { Area } from '@/components/ui/Area';
import { Crosshair as CrosshairIcon, History, LocateFixed, MapPin, PenLine, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useGlobeStore } from '@/features/globe/store';
import { useLocateUser } from '@/features/location/useUserLocation';
import { selectField } from './actions';
import { fieldFromPoint } from './geometry';
import { readRecentFields } from './recent';
import { useFieldStore } from './store';
import type { SelectedField } from './types';

/** Selector de las tres formas de elegir la finca y modo pin (chunk diferido: solo tras tocar "Mi finca"). */
function OptionButton({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: typeof MapPin;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-white/5 px-4 py-3 text-left ring-1 ring-line hover:bg-white/10 active:scale-[0.99]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-field-500/20 text-field-300">
        <Icon aria-hidden className="size-6" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}

export function Chooser() {
  const t = useTranslations('field');
  const tc = useTranslations('common');
  const locale = useLocale();
  const setMode = useFieldStore((s) => s.setMode);
  const locate = useLocateUser();
  // El selector solo se monta en el cliente (tras cargar el globo): se puede leer localStorage al iniciar.
  const [recent] = useState<SelectedField[]>(() => readRecentFields());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode('idle');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode]);

  const useMyLocation = async () => {
    const pos = await locate();
    if (pos) await selectField(fieldFromPoint([pos.lng, pos.lat], 'location'), { locale });
    else setMode('idle');
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="field-chooser-title"
      className="panel pointer-events-auto w-full max-w-md rounded-3xl p-4 shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="field-chooser-title" className="text-lg font-bold">
          {t('chooseTitle')}
        </h2>
        <button
          type="button"
          onClick={() => setMode('idle')}
          aria-label={tc('close')}
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <OptionButton
          icon={LocateFixed}
          title={t('optLocation')}
          hint={t('optLocationHint')}
          onClick={useMyLocation}
        />
        <OptionButton
          icon={MapPin}
          title={t('optPin')}
          hint={t('optPinHint')}
          onClick={() => setMode('pin')}
        />
        <OptionButton
          icon={PenLine}
          title={t('optDraw')}
          hint={t('optDrawHint')}
          onClick={() => setMode('draw')}
        />
      </div>
      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
            <History aria-hidden className="size-4" /> {t('recent')}
          </h3>
          <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recent.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => void selectField({ ...f, source: 'recent' }, { locale })}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-3 text-sm whitespace-nowrap ring-1 ring-line hover:bg-white/10"
                >
                  {f.geometry.type === 'Polygon' ? (
                    <PenLine aria-hidden className="size-4 text-field-400" />
                  ) : (
                    <MapPin aria-hidden className="size-4 text-field-400" />
                  )}
                  {f.name ?? t('unnamedField')}
                  {f.areaHa != null && (
                    <span className="text-ink-muted">· <Area ha={f.areaHa} /></span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Pin: tocar el mapa, o (con una mano) mover el globo y poner la finca en la mira. */
export function PinMode() {
  const t = useTranslations('field');
  const tc = useTranslations('common');
  const locale = useLocale();
  const map = useGlobeStore((s) => s.map);
  const setMode = useFieldStore((s) => s.setMode);

  useEffect(() => {
    if (!map) return;
    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      void selectField(fieldFromPoint([e.lngLat.lng, e.lngLat.lat], 'pin'), {
        locale,
        fly: map.getZoom() < 12,
      });
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setMode('idle');
    window.addEventListener('keydown', onKey);
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [map, locale, setMode]);

  const placeAtCrosshair = () => {
    if (!map) return;
    const c = map.getCenter();
    void selectField(fieldFromPoint([c.lng, c.lat], 'pin'), { locale, fly: map.getZoom() < 12 });
  };

  return (
    <div className="pointer-events-none flex w-full max-w-md flex-col items-center gap-2">
      <p role="status" className="glass rounded-2xl px-4 py-2 text-center text-sm font-medium shadow-lg">
        {t('pinInstruction')}
      </p>
      <div className="pointer-events-auto flex w-full gap-2">
        <button
          type="button"
          onClick={() => setMode('idle')}
          className="glass h-12 flex-1 rounded-full font-semibold shadow-lg"
        >
          {tc('cancel')}
        </button>
        <button
          type="button"
          onClick={placeAtCrosshair}
          className={clsx(
            'flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-field-500 font-semibold text-black shadow-lg',
            'active:scale-[0.98]',
          )}
        >
          <CrosshairIcon aria-hidden className="size-5" />
          {t('pinHere')}
        </button>
      </div>
    </div>
  );
}
