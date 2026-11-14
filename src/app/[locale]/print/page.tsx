import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import PrintView from '@/features/rotations/PrintView';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'print' });
  return { title: t('title'), robots: { index: false } };
}

/** Resumen imprimible de las opciones de rotación (sin globo: carga liviana y estilos de papel). */
export default async function PrintPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <PrintView />
    </Suspense>
  );
}
