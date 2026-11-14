import type { CropId } from '@/lib/api/contract';

/**
 * Asociaciones conocidas de cultivos (policultivos). Nombres, historia y cómo sembrar en
 * messages → mixed.guilds.items.<id>.{name, story, layout}.
 *
 * `sowWeek`: semanas después de la primera siembra (en la milpa el frijol va cuando el maíz mide ~15 cm).
 * `role`: qué hace cada planta en la asociación (se muestra con ícono y texto).
 */
export type GuildRole = 'pillar' | 'climber' | 'cover' | 'fixer' | 'long' | 'shade' | 'main' | 'roots';

export type GuildMember = { crop: CropId; role: GuildRole; sowWeek: number };

export type Guild = {
  id: string;
  members: GuildMember[];
  /** Mezcla de cobertura o forraje de la época fresca: se siembra entre cosechas (después del cultivo principal). */
  coolSeason?: boolean;
};

export const GUILDS: Guild[] = [
  {
    id: 'three-sisters',
    members: [
      { crop: 'maize', role: 'pillar', sowWeek: 0 },
      { crop: 'beans', role: 'climber', sowWeek: 3 },
      { crop: 'squash', role: 'cover', sowWeek: 3 },
    ],
  },
  {
    id: 'milpa-cassava',
    members: [
      { crop: 'maize', role: 'pillar', sowWeek: 0 },
      { crop: 'beans', role: 'climber', sowWeek: 3 },
      { crop: 'squash', role: 'cover', sowWeek: 3 },
      { crop: 'cassava', role: 'long', sowWeek: 0 },
    ],
  },
  {
    id: 'cassava-groundnut',
    members: [
      { crop: 'cassava', role: 'main', sowWeek: 0 },
      { crop: 'groundnut', role: 'fixer', sowWeek: 0 },
    ],
  },
  {
    id: 'maize-pigeonpea',
    members: [
      { crop: 'maize', role: 'main', sowWeek: 0 },
      { crop: 'pigeonpea', role: 'fixer', sowWeek: 0 },
    ],
  },
  {
    id: 'millet-cowpea',
    members: [
      { crop: 'millet', role: 'main', sowWeek: 0 },
      { crop: 'cowpea', role: 'cover', sowWeek: 2 },
    ],
  },
  {
    id: 'sorghum-pigeonpea',
    members: [
      { crop: 'sorghum', role: 'main', sowWeek: 0 },
      { crop: 'pigeonpea', role: 'fixer', sowWeek: 0 },
    ],
  },
  {
    id: 'coffee-agroforestry',
    members: [
      { crop: 'coffee', role: 'main', sowWeek: 0 },
      { crop: 'plantain', role: 'shade', sowWeek: 0 },
      { crop: 'shade-trees', role: 'shade', sowWeek: 0 },
      { crop: 'forage-peanut', role: 'cover', sowWeek: 0 },
    ],
  },
  {
    id: 'maize-soybean-strips',
    members: [
      { crop: 'maize', role: 'main', sowWeek: 0 },
      { crop: 'soybean', role: 'fixer', sowWeek: 0 },
    ],
  },
  {
    id: 'winter-cover-mix',
    coolSeason: true,
    members: [
      { crop: 'rye', role: 'pillar', sowWeek: 0 },
      { crop: 'vetch', role: 'climber', sowWeek: 0 },
      { crop: 'radish', role: 'roots', sowWeek: 0 },
    ],
  },
  {
    id: 'oats-vetch',
    coolSeason: true,
    members: [
      { crop: 'oats', role: 'pillar', sowWeek: 0 },
      { crop: 'vetch', role: 'climber', sowWeek: 0 },
    ],
  },
  {
    id: 'wheat-clover',
    members: [
      { crop: 'wheat', role: 'main', sowWeek: 0 },
      { crop: 'clover', role: 'cover', sowWeek: 12 },
    ],
  },
];

export const GUILD_BY_ID: Record<string, Guild> = Object.fromEntries(GUILDS.map((g) => [g.id, g]));

/**
 * Asociación conocida que más se parece a una mezcla (mismos cultivos o casi). Su cultivo principal tiene que
 * estar: sin maíz no es una milpa.
 */
export function matchGuild(crops: readonly CropId[]): Guild | null {
  let best: { g: Guild; j: number } | null = null;
  const set = new Set(crops);
  for (const g of GUILDS) {
    const main = g.members.find((m) => m.role === 'pillar' || m.role === 'main');
    if (main && !set.has(main.crop)) continue;
    const gs = new Set(g.members.map((m) => m.crop));
    const inter = [...gs].filter((c) => set.has(c)).length;
    const j = inter / (gs.size + set.size - inter);
    if (j >= 0.6 && (!best || j > best.j)) best = { g, j };
  }
  return best?.g ?? null;
}
