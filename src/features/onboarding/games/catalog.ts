import type { GlossaryTerm } from '@/features/glossary/terms';
import type { OnboardingAnswers, QuestLevel, QuestSummary } from '@/lib/api/contract';

/**
 * Los 7 retos del inicio, en orden de juego: primero el más vistoso (engancha), al final la temporada, que junta
 * todo. Cada reto enseña uno o dos términos del glosario y dice qué misión de la NASA mide eso.
 */
export const GAME_IDS = ['ndvi', 'et', 'balance', 'anomaly', 'frost', 'sensors', 'season'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAMES: Record<GameId, { terms: readonly [GlossaryTerm, ...GlossaryTerm[]]; missions: readonly string[] }> = {
  ndvi: { terms: ['ndvi'], missions: ['MODIS', 'VIIRS', 'Landsat · Sentinel (HLS)'] },
  et: { terms: ['et'], missions: ['ECOSTRESS', 'MODIS'] },
  balance: { terms: ['water-balance', 'rain'], missions: ['GPM IMERG', 'ECOSTRESS'] },
  anomaly: { terms: ['anomaly', 'soil-moisture'], missions: ['SMAP'] },
  frost: { terms: ['frost', 'lst'], missions: ['NASA POWER', 'MODIS'] },
  sensors: { terms: ['satellite-vs-field'], missions: ['SMAP'] },
  season: { terms: ['crop-vulnerability', 'soil-health'], missions: ['SMAP', 'GPM IMERG', 'ECOSTRESS', 'MODIS'] },
};

/** Estrellas de un reto (1 a 3) según los errores; 0 = saltado. */
export type Stars = 0 | 1 | 2 | 3;
export const starsFor = (mistakes: number): Exclude<Stars, 0> => (mistakes <= 0 ? 3 : mistakes <= 2 ? 2 : 1);
export const MAX_STARS = GAME_IDS.length * 3;

export type QuestResults = Partial<Record<GameId, Stars>>;

export const totalStars = (r: QuestResults) => GAME_IDS.reduce((sum, id) => sum + (r[id] ?? 0), 0);

/** Nivel por estrellas sobre el total posible: saltar un reto no cuenta como saberlo. */
export function levelFor(stars: number): QuestLevel {
  if (stars >= 17) return 'advanced';
  if (stars >= 10) return 'intermediate';
  return 'beginner';
}

/**
 * Resumen para el perfil: nivel, términos que domina (3 estrellas) y los que conviene repasar (1 estrella o
 * saltado). El asistente lo recibe para explicar con calma lo que costó.
 */
export function summarize(r: QuestResults): QuestSummary {
  const stars = totalStars(r);
  const main = (id: GameId) => GAMES[id].terms[0];
  return {
    level: levelFor(stars),
    stars,
    maxStars: MAX_STARS,
    mastered: GAME_IDS.filter((id) => r[id] === 3).map(main),
    review: GAME_IDS.filter((id) => (r[id] ?? 0) <= 1).map(main),
  };
}

/** Tipo de perfil (insignia): quién es y qué quiere hacer. Textos en onboarding.results.archetype.<rol>.<objetivo>. */
export const archetypeKey = (a: Pick<OnboardingAnswers, 'role' | 'goal'>) => `${a.role}.${a.goal}` as const;
