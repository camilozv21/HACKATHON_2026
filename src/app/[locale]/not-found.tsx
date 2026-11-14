import { getLocale, getTranslations } from 'next-intl/server';

/**
 * 404 amable dentro de un idioma. Sin íconos de lucide (son componentes de cliente): este archivo forma parte del
 * layout de [locale] y cualquier componente de cliente aquí entraría en el JS inicial de todas las páginas.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  const locale = await getLocale();
  return (
    <main className="starfield flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-field-500/15 text-field-300 ring-1 ring-field-500/40">
        <svg aria-hidden viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
        </svg>
      </span>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-sm text-ink-muted">{t('text')}</p>
      <a href={`/${locale}`} className="flex min-h-12 items-center rounded-full bg-field-500 px-6 font-semibold text-black hover:bg-field-400">
        {t('home')}
      </a>
    </main>
  );
}
