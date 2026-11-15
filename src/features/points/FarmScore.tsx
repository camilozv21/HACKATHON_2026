import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import type { LevelId } from '@/lib/points';
import { LevelIcon } from './LevelIcon';

/**
 * Puntaje de una finca (el de la cuenta dueña): puntos y nivel. Sirve en RSC (/fincas) y en el cliente (tarjeta del
 * globo). El `title` aclara que mide el uso de la app, no la calidad de la finca ni de sus productos.
 */
export function FarmScore({ points, level, size = 'md' }: { points: number; level: LevelId; size?: 'sm' | 'md' }) {
  const t = useTranslations('points');
  const locale = useLocale();
  const n = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO').format(points);
  return (
    <span
      title={t('farm.what')}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full bg-sun/15 font-semibold text-sun ring-1 ring-sun/40',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      )}
    >
      <LevelIcon level={level} className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      <span>{t('farm.badge', { points: n, level: t(`levels.${level}`) })}</span>
    </span>
  );
}
