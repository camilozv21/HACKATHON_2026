import { ArrowLeft, ExternalLink, Info } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** Datasets NASA usados, con enlace a la fuente oficial. Los textos (qué mide, detalle, latencia) están en messages. */
const DATASETS = [
  { id: 'smap', name: 'SMAP L3/L4', url: 'https://smap.jpl.nasa.gov/data/' },
  { id: 'gpm', name: 'GPM IMERG', url: 'https://gpm.nasa.gov/data/imerg' },
  { id: 'modis', name: 'MODIS / VIIRS NDVI', url: 'https://modis.gsfc.nasa.gov/data/dataprod/mod13.php' },
  { id: 'hls', name: 'HLS (Landsat + Sentinel-2)', url: 'https://www.earthdata.nasa.gov/data/projects/hls' },
  { id: 'ecostress', name: 'ECOSTRESS', url: 'https://ecostress.jpl.nasa.gov/data' },
  { id: 'power', name: 'NASA POWER', url: 'https://power.larc.nasa.gov/' },
  { id: 'grace', name: 'GRACE / GRACE-FO', url: 'https://grace.jpl.nasa.gov/data/get-data/' },
  { id: 'srtm', name: 'SRTM', url: 'https://www.earthdata.nasa.gov/data/instruments/srtm' },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return { title: t('title'), description: t('intro') };
}

/** "Acerca de los datos": datasets, cómo se combinan, límites, privacidad de la ubicación y créditos. */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-12">
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
      </header>

      <section aria-labelledby="ds-title">
        <h2 id="ds-title" className="mb-3 text-xl font-bold">
          {t('datasetsTitle')}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DATASETS.map((d) => (
            <li key={d.id} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
              <p className="font-bold">{d.name}</p>
              <p className="text-sm">{t(`rows.${d.id}.what`)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs text-ink-muted">
                <dt>{t('cols.resolution')}:</dt>
                <dd>{t(`rows.${d.id}.resolution`)}</dd>
                <dt>{t('cols.latency')}:</dt>
                <dd>{t(`rows.${d.id}.latency`)}</dd>
              </dl>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-sky-glow underline underline-offset-4"
              >
                {t('cols.link')}
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hm-title">
        <h2 id="hm-title" className="mb-2 text-xl font-bold">
          {t('harmonizeTitle')}
        </h2>
        <p>{t('harmonize')}</p>
      </section>

      <section aria-labelledby="lm-title">
        <h2 id="lm-title" className="mb-2 text-xl font-bold">
          {t('limitsTitle')}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>{t(`limits.${i}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pv-title">
        <h2 id="pv-title" className="mb-2 text-xl font-bold">
          {t('privacyTitle')}
        </h2>
        <p>{t('privacy')}</p>
      </section>

      <section aria-labelledby="cr-title">
        <h2 id="cr-title" className="mb-2 text-xl font-bold">
          {t('creditsTitle')}
        </h2>
        <p className="text-sm text-ink-muted">{t('credits')}</p>
      </section>

      <p className="flex items-start gap-2 rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-glow" />
        {t('disclaimer')}
      </p>
    </main>
  );
}
