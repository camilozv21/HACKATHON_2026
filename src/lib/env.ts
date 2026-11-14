/** Variables públicas (inyectadas en build por Next). */
export const env = {
  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ?? '',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? '',
  useMocks: (process.env.NEXT_PUBLIC_USE_MOCKS ?? 'true').trim() !== 'false',
} as const;
