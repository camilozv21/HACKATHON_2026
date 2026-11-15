import { ArrowLeft, GraduationCap } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TermIcon } from '@/features/glossary/TermIcon';
import { GLOSSARY_TERMS } from '@/features/glossary/terms';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'glossaryPage' });
  return { title: t('title'), description: t('intro') };
}

/** Glosario completo (también existe como hoja modal dentro de la app): frase simple, ejemplo del campo e ícono. */
export default async function GlossaryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('glossaryPage');
  const tg = await getTranslations('glossary');

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
        <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">Field Shift</p>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
        <a
          href={`/${locale}/academy`}
          className="mt-3 flex min-h-12 w-fit items-center gap-2 rounded-2xl bg-field-500/15 px-3 font-semibold ring-1 ring-field-500/50 hover:bg-field-500/25"
        >
          <GraduationCap aria-hidden className="size-5 text-field-300" />
          {t('academy')}
        </a>
      </header>

      <nav aria-label={t('index')}>
        <ul className="flex flex-wrap gap-2">
          {GLOSSARY_TERMS.map((term) => (
            <li key={term}>
              <a href={`#${term}`} className="flex min-h-11 items-center rounded-full bg-white/5 px-3 text-sm ring-1 ring-line hover:bg-white/10">
                {tg(`terms.${term}.title`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <dl className="flex flex-col gap-3">
        {GLOSSARY_TERMS.map((term) => (
          <div key={term} id={term} className="scroll-mt-6 rounded-3xl bg-white/5 p-4 ring-1 ring-line">
            <dt className="flex items-center gap-3 text-xl font-bold">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-field-500/15 text-field-300">
                <TermIcon term={term} className="size-6" />
              </span>
              {tg(`terms.${term}.title`)}
            </dt>
            <dd className="mt-3 text-base">{tg(`terms.${term}.simple`)}</dd>
            <dd className="mt-2 rounded-2xl bg-black/20 p-3 text-sm">
              <span className="block text-xs font-semibold text-field-300 uppercase">{tg('example')}</span>
              {tg(`terms.${term}.example`)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-muted">{t('note')}</p>
    </main>
  );
}
