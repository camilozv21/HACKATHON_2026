/** Formatos de mercado (pesos colombianos, porcentajes y meses) según el idioma. */
export function formatCop(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

/** Pesos en forma corta para ingresos grandes: "$18 M" / "COP 18M". */
export function formatCopShort(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency: 'COP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPct(value: number, locale: string): string {
  const s = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(value);
  return `${s} %`;
}

export function formatNumber(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: digits }).format(value);
}

/** "2026-10" → "oct 2026" / "Oct 2026". */
export function formatMonth(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
