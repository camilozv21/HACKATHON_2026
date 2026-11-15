'use client';

import { Pencil, Repeat2, Share2, Sprout, Trash2, X } from 'lucide-react';
import { Area } from '@/components/ui/Area';
import { useLocale, useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { formatCoords } from '@/lib/geo';
import { clearField } from './actions';
import { getDemo } from './demoFarms';
import { useFieldStore } from './store';

type TitleComponent = ComponentType<{ className?: string; children?: ReactNode }>;

/** Resumen de la finca: lo que se ve en el "peek" del sheet y arriba del panel en desktop. */
export function FieldSummary({
  variant,
  titleAs: Title = 'h2' as unknown as TitleComponent,
  children,
}: {
  variant: 'sheet' | 'panel';
  titleAs?: TitleComponent;
  children?: ReactNode;
}) {
  const t = useTranslations('field');
  const tc = useTranslations('common');
  const locale = useLocale();
  const field = useFieldStore((s) => s.field);
  const analyzing = useFieldStore((s) => s.analyzing);
  const setAnalyzing = useFieldStore((s) => s.setAnalyzing);
  const setSheet = useFieldStore((s) => s.setSheet);
  const setMode = useFieldStore((s) => s.setMode);

  if (!field) return null;
  const demo = getDemo(field.demoId);
  const name = field.name ?? t('unnamedField');

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: name, text: t('shareText', { name }), url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('linkCopied'), 'success');
      }
    } catch {
      // la persona canceló el diálogo de compartir
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-field-500/20 text-field-300">
          <Sprout aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Title className="truncate text-lg leading-tight font-bold">{name}</Title>
          <p className="text-sm text-ink-muted tabular-nums">
            {demo && (
              <span className="mr-1.5 rounded-full bg-sun/20 px-2 py-0.5 text-xs font-semibold text-sun">
                {t('demoBadge')}
              </span>
            )}
            {demo ? (locale === 'en' ? demo.region.en : demo.region.es) : formatCoords({ lng: field.center[0], lat: field.center[1] }, 3)}
            {field.areaHa != null && <> · <Area ha={field.areaHa} /></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet(null)}
          aria-label={tc('close')}
          className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      {!analyzing && (
        <button
          type="button"
          onClick={() => {
            useFieldStore.getState().setPanelTab('motor');
            setAnalyzing(true);
          }}
          className="flex min-h-13 items-center justify-center gap-2 rounded-full bg-field-500 px-4 py-2 text-base leading-tight font-bold text-black shadow-[var(--shadow-glow)] active:scale-[0.99]"
        >
          <Repeat2 aria-hidden className="size-5 shrink-0" />
          {t('analyze')}
        </button>
      )}

      <div className="flex gap-2">
        <SecondaryButton onClick={share} icon={<Share2 aria-hidden className="size-4" />}>
          {t('share')}
        </SecondaryButton>
        <SecondaryButton onClick={() => setMode('choose')} icon={<Pencil aria-hidden className="size-4" />}>
          {t('change')}
        </SecondaryButton>
        <SecondaryButton onClick={clearField} icon={<Trash2 aria-hidden className="size-4" />}>
          {t('remove')}
        </SecondaryButton>
      </div>

      {/* Publicar la finca y el puntaje viven al final de "Tu finca": aquí solo lo esencial. */}
      {demo && <p className="text-xs text-ink-muted">{t('demoNote')}</p>}
      {variant === 'panel' || analyzing ? children : null}
    </div>
  );
}

function SecondaryButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
    >
      {icon}
      {children}
    </button>
  );
}
