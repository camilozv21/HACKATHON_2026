import { ArrowLeft, GraduationCap, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Academy from '@/features/academy/Academy';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'academy' });
  return { title: t('meta.title'), description: t('meta.description') };
}

/**
 * AgroAcademy: todo lo que tiene Field Shift explicado con lecciones de un minuto (simulador del teléfono + una
 * pregunta + "Pruébalo en el globo") y la práctica de los 7 retos del glosario. Cabecera en el servidor; lo
 * interactivo (avance guardado en el teléfono, lecciones, retos) en el cliente.
 */
export default async function AcademyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('academy');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-12">
      <a
        href={`/${locale}`}
        className="flex min-h-11 items-center gap-1.5 self-start rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </a>
      <header>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-field-300 uppercase">
          <GraduationCap aria-hidden className="size-4" />
          Field Shift
        </p>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
      </header>

      <Academy />

      <p className="flex items-start gap-2 rounded-2xl bg-white/5 p-3 text-sm text-ink-muted ring-1 ring-line">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-field-300" />
        {t('note')}
      </p>
    </main>
  );
}
