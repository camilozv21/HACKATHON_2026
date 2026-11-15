/** Variables públicas (inyectadas en build por Next). */
export const env = {
  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ?? '',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? '',
  useMocks: (process.env.NEXT_PUBLIC_USE_MOCKS ?? 'true').trim() !== 'false',
  /**
   * La radio solo pone los audios grabados por el equipo (segmentos "destacado" con mp3 en public/audio/): sin
   * programa del día, sin identificación en voz y sin leer guiones con la voz del teléfono. `false` lo devuelve todo.
   */
  radioAudioOnly: (process.env.NEXT_PUBLIC_RADIO_AUDIO_ONLY ?? 'true').trim() !== 'false',
} as const;
