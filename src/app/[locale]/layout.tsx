import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers/Providers';
import { routing } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Modo sol / alto contraste y modo sencillo elegidos en Ajustes, aplicados antes del primer pintado (sin parpadeo).
const PREFS_SCRIPT = `try{var d=document.documentElement,c=localStorage.getItem('fieldshift:contrast');if(c==='high'||c==='normal')d.dataset.contrast=c;if(localStorage.getItem('fieldshift:mode')==='lite')d.dataset.mode='lite'}catch(e){}`;

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05070d',
  colorScheme: 'dark',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: t('title'), template: `%s · Field Shift` },
    description: t('description'),
    applicationName: 'Field Shift',
    appleWebApp: { capable: true, title: 'Field Shift', statusBarStyle: 'black-translucent' },
    icons: { apple: '/icons/apple-touch-icon.png' },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="font-sans">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
