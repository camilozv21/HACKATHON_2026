/**
 * Paleta categórica de las estrategias (validada con el validador de dataviz sobre la superficie oscura #101624:
 * CVD ΔE ≥ 8.4, visión normal ≥ 19.8, contraste ≥ 3:1). El color sigue a la estrategia (orden del backend), no a su
 * puesto, para que reordenar no la repinte.
 */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const;
export const seriesColor = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length]!;
