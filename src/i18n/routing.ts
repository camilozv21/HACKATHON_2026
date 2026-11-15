import { defineRouting } from 'next-intl/routing';

export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'es',
  localePrefix: 'always',
  // Español siempre por defecto: `/` va a `/es` aunque el navegador esté en inglés (sin Accept-Language
  // ni cookie). El inglés se elige a mano en Ajustes y vive en las URLs `/en/...`.
  localeDetection: false,
  localeCookie: false,
});
