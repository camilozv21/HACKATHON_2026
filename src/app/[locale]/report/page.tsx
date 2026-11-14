import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import ReportView from '@/features/report/ReportView';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'report' });
  return { title: t('metaTitle'), robots: { index: false } };
}

/**
 * Informe agroclimático imprimible de una zona y un periodo (?lat&lon&name&t=YYYY-MM): NASA POWER diario contra lo
 * normal, eventos del clima, emergencias cercanas, qué vigilar, datos diarios y CSV. Sin globo: carga liviana.
 */
export default async function ReportPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
