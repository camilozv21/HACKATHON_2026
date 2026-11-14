import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/shell/AppShell';
import { OnboardingScript } from '@/features/onboarding/OnboardingScript';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <AppShell />
      <OnboardingScript />
    </>
  );
}
