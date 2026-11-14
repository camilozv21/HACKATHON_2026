/**
 * Biblioteca de sistemas que el motor puede proponer. No trae meses ni puntajes: el calendario sale del clima
 * de la finca (schedule.ts) y los puntajes del modelo (score.ts). Aquí solo va la estructura y el texto.
 *
 *  - Rotaciones: ranuras con opciones de cultivo; el motor elige la opción que mejor se da en el clima.
 *  - Cultivos mixtos (asociaciones): salen de GUILDS (src/features/rotations/mixed/guilds.ts), mismo id que la UI.
 *  - `{0}`, `{1}`… en los textos se reemplazan por el cultivo elegido en esa ranura.
 */
import type { CropId, CropSeason } from '@/lib/api/contract';
import { GUILDS, type Guild } from '@/features/rotations/mixed/guilds';
import { crop } from './agronomy';
import type { Zone } from './site';

export type L = { es: string; en: string };

export type SlotAt =
  | 'main'
  | 'second'
  | 'cool'
  | 'after'
  | 'all'
  | { with: number; offset?: number }
  | { relay: number; offset?: number };

export type Slot = { crop: CropId | readonly CropId[]; role: CropSeason['role']; at: SlotAt; year?: 1 | 2 | 3 };

export type SystemFlags = {
  /** Arroz sembrado directo, sin inundar (ahorra agua y percolación). */
  directSeededRice?: boolean;
  /** Hoyos zaï y medias lunas: concentran la lluvia junto a la raíz. */
  zai?: boolean;
  /** El rastrojo se queda en el suelo como mantillo (no se quema ni se retira). */
  mulch?: boolean;
  /** Se quema el rastrojo. */
  burn?: boolean;
};

export type SystemTpl = {
  id: string;
  kind: 'rotation' | 'mixed';
  zones: Zone[];
  years: 1 | 2 | 3;
  slots: Slot[];
  flags?: SystemFlags;
  /** Práctica con mucha evidencia y adopción (sube la confianza). */
  strong?: boolean;
  /** Solo se propone si la rotación actual tiene alguno de estos cultivos. */
  ifCurrentHas?: CropId[];
  /** Solo se propone si hay animales (mercado de ganado, tracción animal o forraje en la rotación actual). */
  needsLivestock?: boolean;
  name: L;
  rationale: L;
  benefits: L[];
  risks: L[];
  review: L[];
};

export const ROTATIONS: SystemTpl[] = [
  {
    id: 'cereal-legume',
    kind: 'rotation',
    zones: ['savanna', 'humid-tropics', 'tropical-highland', 'subtropical', 'continental', 'semi-arid', 'monsoon'],
    years: 2,
    slots: [
      { crop: ['maize', 'sorghum', 'millet'], role: 'cash', at: 'main', year: 1 },
      { crop: ['soybean', 'beans', 'groundnut', 'cowpea'], role: 'cash', at: 'main', year: 2 },
    ],
    strong: true,
    name: { es: '{0} un año, {1} al siguiente', en: '{0} one year, {1} the next' },
    rationale: {
      es: 'Alternar un cereal con una leguminosa: la leguminosa deja nitrógeno y corta las plagas del cereal.',
      en: 'Alternate a cereal with a legume: the legume leaves nitrogen and breaks the cereal’s pests.',
    },
    benefits: [{ es: 'Rotación sencilla, con semillas y mercados conocidos.', en: 'Simple rotation with familiar seed and markets.' }],
    risks: [{ es: 'Los precios de la leguminosa pueden variar más que los del cereal.', en: 'Legume prices can swing more than cereal prices.' }],
    review: [{ es: 'Variedades de ciclo adecuado para tu temporada de lluvias.', en: 'Varieties with the right cycle for your rainy season.' }],
  },
  {
    id: 'corn-soy-wheat-clover',
    kind: 'rotation',
    zones: ['continental', 'subtropical'],
    years: 3,
    slots: [
      { crop: 'maize', role: 'cash', at: 'main', year: 1 },
      { crop: 'soybean', role: 'cash', at: 'main', year: 2 },
      { crop: ['wheat', 'barley'], role: 'cash', at: 'cool', year: 2 },
      { crop: 'clover', role: 'cover', at: { with: 2, offset: 5 } },
    ],
    strong: true,
    name: { es: 'Maíz – soya – {2} con trébol', en: 'Maize – soybean – {2} with clover' },
    rationale: {
      es: 'Un tercer cultivo de invierno y el trébol rompen el ciclo de plagas y dejan nitrógeno gratis para el maíz.',
      en: 'A third, winter crop and clover break pest cycles and leave free nitrogen for the next maize.',
    },
    benefits: [{ es: 'Rotación más larga: menos gusano de la raíz y malezas resistentes.', en: 'Longer rotation: less rootworm and resistant weeds.' }],
    risks: [
      { es: 'El cereal de invierno suele pagar menos que el maíz.', en: 'The winter cereal usually pays less than maize.' },
      { es: 'Necesita sembradora para el trigo y un comprador cerca.', en: 'Needs a grain drill and a nearby buyer.' },
    ],
    review: [{ es: 'Mercado o acopio que compre el cereal de invierno cerca.', en: 'Market or elevator buying the winter cereal nearby.' }],
  },
  {
    id: 'double-crop',
    kind: 'rotation',
    zones: ['subtropical', 'monsoon', 'mediterranean'],
    years: 2,
    slots: [
      { crop: ['wheat', 'barley'], role: 'cash', at: 'cool', year: 1 },
      { crop: ['soybean', 'mungbean', 'sunflower'], role: 'cash', at: 'after', year: 1 },
      { crop: ['maize', 'sorghum'], role: 'cash', at: 'main', year: 2 },
    ],
    strong: true,
    name: { es: '{0}/{1} de segunda – {2}', en: '{0}/double-crop {1} – {2}' },
    rationale: {
      es: 'Dos cosechas el primer año y un cereal de mucho rastrojo el segundo: raíces vivas casi todo el año.',
      en: 'Two harvests in year one and a high-residue cereal in year two: living roots most of the year.',
    },
    benefits: [{ es: 'Rotar gramíneas con otra familia corta malezas y enfermedades.', en: 'Rotating grasses with another family breaks weeds and diseases.' }],
    risks: [{ es: 'El cultivo de segunda depende de que llueva a tiempo tras la cosecha del cereal.', en: 'The second crop depends on timely rain after the cereal harvest.' }],
    review: [{ es: 'Fecha límite de siembra del cultivo de segunda en tu zona.', en: 'Latest planting date for the second crop in your area.' }],
  },
  {
    id: 'maize-wheat-mung',
    kind: 'rotation',
    zones: ['monsoon'],
    years: 1,
    slots: [
      { crop: 'maize', role: 'cash', at: 'main' },
      { crop: ['wheat', 'chickpea'], role: 'cash', at: 'cool' },
      { crop: 'mungbean', role: 'cover', at: 'after' },
    ],
    name: { es: 'Maíz – {1} con frijol mungo en verano', en: 'Maize – {1} with summer mungbean' },
    rationale: {
      es: 'Cambiar el arroz inundado por maíz gasta mucha menos agua. El frijol mungo en el hueco de verano fija nitrógeno.',
      en: 'Swapping flooded rice for maize uses far less water. Mungbean in the summer gap fixes nitrogen.',
    },
    benefits: [{ es: 'El mungo es de ciclo corto: cabe entre el trigo y el maíz.', en: 'Mungbean is short-cycle: it fits between wheat and maize.' }],
    risks: [
      { es: 'El maíz no tiene precio garantizado en todas partes.', en: 'Maize doesn’t have a guaranteed price everywhere.' },
      { es: 'Lluvias fuertes del monzón pueden encharcar el maíz.', en: 'Heavy monsoon rain can waterlog maize.' },
    ],
    review: [{ es: 'Drenaje de la parcela en el monzón.', en: 'Plot drainage during the monsoon.' }],
    ifCurrentHas: ['rice'],
  },
  {
    id: 'dsr-wheat-residue',
    kind: 'rotation',
    zones: ['monsoon', 'humid-tropics', 'savanna', 'subtropical'],
    years: 1,
    slots: [
      { crop: 'rice', role: 'cash', at: 'main' },
      { crop: ['wheat', 'chickpea', 'mungbean'], role: 'cash', at: 'cool' },
    ],
    flags: { directSeededRice: true, mulch: true },
    name: { es: 'Arroz de siembra directa – {1} sin quemar paja', en: 'Direct-seeded rice – {1} without burning straw' },
    rationale: {
      es: 'Mantienes el arroz, pero sembrado directo sin inundar. La paja queda en el suelo como abono.',
      en: 'You keep rice, but direct-seeded without flooding. Straw stays on the soil as mulch.',
    },
    benefits: [{ es: 'La paja aporta materia orgánica en vez de quemarse.', en: 'Straw adds organic matter instead of being burned.' }],
    risks: [{ es: 'Más malezas al inicio: requiere buen control.', en: 'More weeds early on: needs good control.' }],
    review: [{ es: 'Acceso a sembradora para siembra directa.', en: 'Access to a direct-seeding drill.' }],
    ifCurrentHas: ['rice'],
  },
  {
    id: 'wheat-chickpea',
    kind: 'rotation',
    zones: ['mediterranean', 'monsoon', 'subtropical'],
    years: 2,
    slots: [
      { crop: ['wheat', 'barley'], role: 'cash', at: 'cool', year: 1 },
      { crop: ['chickpea', 'vetch'], role: 'cash', at: 'cool', year: 2 },
    ],
    strong: true,
    name: { es: '{0} – {1} en vez de barbecho', en: '{0} – {1} instead of fallow' },
    rationale: {
      es: 'Una leguminosa de invierno en lugar del barbecho: deja nitrógeno y aprovecha la lluvia de la época fresca.',
      en: 'A winter legume instead of fallow: it leaves nitrogen and uses the cool-season rain.',
    },
    benefits: [{ es: 'Menos fertilizante para el cereal del año siguiente.', en: 'Less fertilizer for the next year’s cereal.' }],
    risks: [{ es: 'En años muy secos la leguminosa rinde poco.', en: 'In very dry years the legume yields little.' }],
    review: [{ es: 'Variedades de garbanzo tolerantes a la rabia (Ascochyta).', en: 'Chickpea varieties tolerant to Ascochyta blight.' }],
  },
  {
    id: 'highland-potato',
    kind: 'rotation',
    zones: ['cold-highland', 'tropical-highland'],
    years: 2,
    slots: [
      { crop: 'potato', role: 'cash', at: 'main', year: 1 },
      { crop: ['oats', 'barley'], role: 'forage', at: 'after', year: 1 },
      { crop: ['beans', 'barley'], role: 'cash', at: 'main', year: 2 },
      { crop: 'vetch', role: 'cover', at: 'after', year: 2 },
    ],
    name: { es: 'Papa – {1} – {2} con vicia', en: 'Potato – {1} – {2} with vetch' },
    rationale: {
      es: 'Después de la papa, un cereal y una leguminosa: el suelo descansa de las plagas de la papa y gana nitrógeno.',
      en: 'After potato, a cereal and a legume: the soil rests from potato pests and gains nitrogen.',
    },
    benefits: [{ es: 'Menos gusano blanco y gota que repitiendo papa.', en: 'Less white grub and late blight than repeating potato.' }],
    risks: [{ es: 'Ingreso menor en los años sin papa.', en: 'Lower income in the years without potato.' }],
    review: [{ es: 'Semilla de papa certificada y control de gota.', en: 'Certified seed potato and late-blight control.' }],
  },
  {
    id: 'ley-pasture',
    kind: 'rotation',
    zones: ['continental', 'subtropical', 'savanna', 'tropical-highland', 'humid-tropics', 'mediterranean', 'cold-highland'],
    years: 3,
    slots: [
      { crop: ['alfalfa', 'pasture'], role: 'forage', at: 'all', year: 1 },
      { crop: ['alfalfa', 'pasture'], role: 'perennial', at: 'all', year: 2 },
      { crop: ['maize', 'wheat', 'sorghum', 'potato'], role: 'cash', at: 'main', year: 3 },
    ],
    strong: true,
    needsLivestock: true,
    name: { es: '{0} dos años – {2} un año (con ganado)', en: '{0} for two years – {2} for one (with livestock)' },
    rationale: {
      es: 'Dos años de forraje recuperan la estructura y la materia orgánica del suelo; luego un cultivo aprovecha esa fertilidad.',
      en: 'Two years of forage rebuild soil structure and organic matter; then a crop uses that fertility.',
    },
    benefits: [{ es: 'Forraje propio para los animales y menos labranza.', en: 'Your own forage for animals and less tillage.' }],
    risks: [{ es: 'Solo conviene si tienes animales o vendes el forraje.', en: 'Only worth it if you keep animals or sell the forage.' }],
    review: [{ es: 'Carga animal y manejo del pastoreo.', en: 'Stocking rate and grazing management.' }],
  },
  {
    id: 'soy-maize-brachiaria',
    kind: 'rotation',
    zones: ['savanna', 'humid-tropics', 'subtropical'],
    years: 1,
    slots: [
      { crop: 'soybean', role: 'cash', at: 'main' },
      { crop: ['maize', 'sorghum'], role: 'cash', at: 'after' },
      { crop: 'pasture', role: 'cover', at: { with: 1, offset: 1 } },
    ],
    strong: true,
    name: { es: 'Soya – {1} de segunda con pasto intercalado', en: 'Soybean – second-crop {1} with intercropped grass' },
    rationale: {
      es: 'El pasto sembrado con el cereal de segunda sigue verde en la época seca: cubre el suelo y da forraje (integración cultivo–ganado).',
      en: 'Grass sown with the second-crop cereal stays green in the dry season: it covers soil and gives forage (crop–livestock integration).',
    },
    benefits: [{ es: 'Suelo cubierto en la época seca y pasto para el ganado.', en: 'Covered soil in the dry season and grass for cattle.' }],
    risks: [{ es: 'Si el pasto crece mucho compite con el cereal: siembra a tiempo y en dosis baja.', en: 'If the grass grows too much it competes with the cereal: sow on time at a low rate.' }],
    review: [{ es: 'Especie de pasto (braquiaria u otra) y dosis de siembra.', en: 'Grass species (brachiaria or other) and seeding rate.' }],
  },
  {
    id: 'zai-agroforestry',
    kind: 'mixed',
    zones: ['semi-arid', 'arid', 'savanna'],
    years: 1,
    slots: [
      { crop: ['sorghum', 'millet'], role: 'cash', at: 'main' },
      { crop: 'cowpea', role: 'intercrop', at: { with: 0, offset: 1 } },
      { crop: 'shade-trees', role: 'perennial', at: 'all' },
    ],
    flags: { zai: true, mulch: true },
    strong: true,
    name: { es: '{0} y caupí con zaï, mantillo y árboles', en: '{0} and cowpea with zaï pits, mulch and trees' },
    rationale: {
      es: 'Los hoyos zaï y el mantillo guardan la poca lluvia junto a la raíz. Árboles como Faidherbia dan sombra y abonan el suelo.',
      en: 'Zaï pits and mulch keep scarce rain near the roots. Trees such as Faidherbia give shade and fertilize the soil.',
    },
    benefits: [{ es: 'Más agua para el cultivo en años secos.', en: 'More water for the crop in dry years.' }],
    risks: [{ es: 'Cavar los zaï exige mucho trabajo al principio.', en: 'Digging zaï pits takes a lot of work at first.' }],
    review: [{ es: 'Disponibilidad de mano de obra y estiércol.', en: 'Availability of labor and manure.' }],
  },
  {
    id: 'coffee-renewal-intercrop',
    kind: 'mixed',
    zones: ['tropical-highland'],
    years: 2,
    slots: [
      { crop: 'coffee', role: 'perennial', at: 'all', year: 1 },
      { crop: 'beans', role: 'intercrop', at: 'second', year: 1 },
      { crop: 'maize', role: 'intercrop', at: 'main', year: 1 },
      { crop: 'coffee', role: 'perennial', at: 'all', year: 2 },
      { crop: 'beans', role: 'intercrop', at: 'second', year: 2 },
      { crop: 'forage-peanut', role: 'cover', at: 'main', year: 2 },
    ],
    ifCurrentHas: ['coffee'],
    name: { es: 'Renovación del café con frijol y maíz intercalados', en: 'Coffee renewal with intercropped beans and maize' },
    rationale: {
      es: 'Mientras el café renovado crece, el frijol y el maíz dan ingresos y cubren el suelo. El frijol aporta nitrógeno.',
      en: 'While renewed coffee grows, beans and maize bring income and cover the soil. Beans add nitrogen.',
    },
    benefits: [{ es: 'Ingresos durante los meses sin cosecha de café.', en: 'Income during the months without coffee harvest.' }],
    risks: [{ es: 'Más trabajo en siembra y cosecha.', en: 'More work at planting and harvest.' }],
    review: [{ es: 'Plan de renovación (zoca o siembra) por lotes.', en: 'Renewal plan (stumping or replanting) by plot.' }],
  },
];

// ---------------------------------------------------------------- cultivos mixtos (asociaciones de la UI)

type GuildText = { zones: Zone[]; name: L; rationale: L; benefit: L; risk: L; review: L; strong?: boolean; ifCurrentHas?: CropId[] };

const GUILD_TEXT: Record<string, GuildText> = {
  'three-sisters': {
    zones: ['tropical-highland', 'humid-tropics', 'savanna', 'subtropical', 'continental'],
    strong: true,
    name: { es: 'Milpa: maíz, frijol y calabaza juntos', en: 'Milpa: maize, beans and squash together' },
    rationale: {
      es: 'Las “tres hermanas”: el maíz sirve de tutor al frijol, el frijol deja nitrógeno y la calabaza cubre el suelo y frena la maleza.',
      en: 'The “three sisters”: maize holds up the beans, beans leave nitrogen and squash covers the soil and holds back weeds.',
    },
    benefit: { es: 'Tres cosechas del mismo terreno: comida variada para la casa y para vender.', en: 'Three harvests from the same land: varied food for home and sale.' },
    risk: { es: 'Cosecha más manual: difícil de mecanizar.', en: 'More manual harvest: hard to mechanize.' },
    review: { es: 'Distancias de siembra y variedad de frijol trepador.', en: 'Planting distances and climbing bean variety.' },
  },
  'milpa-cassava': {
    zones: ['humid-tropics', 'savanna'],
    name: { es: 'Milpa con yuca: maíz, frijol, calabaza y yuca', en: 'Milpa with cassava: maize, beans, squash and cassava' },
    rationale: {
      es: 'Los cultivos cortos se cosechan primero y la yuca sigue cubriendo el suelo varios meses más.',
      en: 'The short crops are harvested first and cassava keeps covering the soil for months more.',
    },
    benefit: { es: 'Comida escalonada durante casi todo el año.', en: 'Staggered food through most of the year.' },
    risk: { es: 'La yuca saca muchos nutrientes: alterna el lote al año siguiente.', en: 'Cassava draws many nutrients: move it to another plot next year.' },
    review: { es: 'Densidad de yuca para que no sombree al frijol.', en: 'Cassava density so it does not shade the beans.' },
  },
  'cassava-groundnut': {
    zones: ['humid-tropics', 'savanna'],
    strong: true,
    name: { es: 'Yuca con maní intercalado', en: 'Cassava with intercropped groundnut' },
    rationale: {
      es: 'El maní cubre el suelo y deja nitrógeno mientras la yuca, que crece despacio, todavía no cierra el surco.',
      en: 'Groundnut covers the soil and leaves nitrogen while slow-growing cassava has not yet closed the rows.',
    },
    benefit: { es: 'Una cosecha de maní sin perder la de yuca.', en: 'A groundnut harvest without losing the cassava one.' },
    risk: { es: 'Cosechar el maní sin dañar las raíces de la yuca.', en: 'Harvest groundnut without damaging cassava roots.' },
    review: { es: 'Fecha de siembra del maní según las lluvias.', en: 'Groundnut planting date by the rains.' },
  },
  'maize-pigeonpea': {
    zones: ['savanna', 'semi-arid', 'tropical-highland', 'humid-tropics'],
    strong: true,
    name: { es: 'Maíz con guandul intercalado', en: 'Maize with intercropped pigeon pea' },
    rationale: {
      es: 'El guandul crece despacio bajo el maíz y sigue verde después de la cosecha: sus raíces profundas aguantan la sequía y dejan nitrógeno.',
      en: 'Pigeon pea grows slowly under maize and stays green after harvest: its deep roots handle drought and leave nitrogen.',
    },
    benefit: { es: 'Grano y forraje en la época seca, cuando casi nada crece.', en: 'Grain and fodder in the dry season, when little else grows.' },
    risk: { es: 'Hay que proteger el guandul de los animales sueltos en la época seca.', en: 'Pigeon pea must be protected from roaming animals in the dry season.' },
    review: { es: 'Variedad de guandul de ciclo medio.', en: 'Medium-duration pigeon pea variety.' },
  },
  'millet-cowpea': {
    zones: ['semi-arid', 'arid', 'savanna'],
    strong: true,
    name: { es: 'Mijo con caupí intercalado', en: 'Millet with intercropped cowpea' },
    rationale: {
      es: 'El caupí es una leguminosa rastrera: cubre el suelo, fija nitrógeno y da grano y forraje.',
      en: 'Cowpea is a spreading legume: it covers the soil, fixes nitrogen and gives grain and fodder.',
    },
    benefit: { es: 'Forraje de caupí para los animales en la época seca.', en: 'Cowpea fodder for animals in the dry season.' },
    risk: { es: 'El caupí sufre plagas de vaina si llueve poco.', en: 'Cowpea suffers pod pests in low-rain years.' },
    review: { es: 'Variedades de ciclo corto para tu ventana de lluvias.', en: 'Short-cycle varieties for your rain window.' },
  },
  'sorghum-pigeonpea': {
    zones: ['semi-arid', 'savanna'],
    name: { es: 'Sorgo con guandul intercalado', en: 'Sorghum with intercropped pigeon pea' },
    rationale: {
      es: 'Dos cultivos que aguantan la sequía con raíces a distinta profundidad: no compiten por la misma agua.',
      en: 'Two drought-hardy crops with roots at different depths: they don’t compete for the same water.',
    },
    benefit: { es: 'Cosecha más segura en años secos.', en: 'Safer harvest in dry years.' },
    risk: { es: 'El sorgo alto puede sombrear al guandul al inicio.', en: 'Tall sorghum can shade pigeon pea early on.' },
    review: { es: 'Arreglo de surcos (p. ej. 2 de sorgo por 1 de guandul).', en: 'Row arrangement (e.g. 2 sorghum rows per pigeon pea row).' },
  },
  'coffee-agroforestry': {
    zones: ['tropical-highland'],
    strong: true,
    ifCurrentHas: ['coffee'],
    name: { es: 'Café con sombrío, plátano y maní forrajero', en: 'Coffee with shade trees, plantain and forage peanut' },
    rationale: {
      es: 'El maní forrajero cubre el suelo todo el año y los árboles de sombra bajan el calor. Menos erosión y menos fertilizante.',
      en: 'Forage peanut covers the soil all year and shade trees lower heat. Less erosion and less fertilizer.',
    },
    benefit: { es: 'El plátano da ingresos mientras el café produce.', en: 'Plantain brings income alongside coffee.' },
    risk: { es: 'Demasiada sombra favorece la roya: hay que podar.', en: 'Too much shade favors coffee rust: pruning needed.' },
    review: { es: 'Porcentaje de sombra adecuado para tu altitud.', en: 'Right shade percentage for your altitude.' },
  },
  'maize-soybean-strips': {
    zones: ['continental', 'subtropical', 'savanna', 'monsoon'],
    name: { es: 'Maíz y soya en franjas', en: 'Maize and soybean in strips' },
    rationale: {
      es: 'Franjas alternas de maíz y soya en el mismo lote: se rotan cada año y cada franja aprovecha la luz del borde.',
      en: 'Alternating maize and soybean strips in the same field: they swap each year and each strip uses edge light.',
    },
    benefit: { es: 'Se puede hacer con la misma maquinaria si las franjas son del ancho de la sembradora.', en: 'Works with the same machinery if strips match the planter width.' },
    risk: { es: 'La soya junto al maíz recibe menos luz: franjas de al menos 6 surcos.', en: 'Soybean next to maize gets less light: strips of at least 6 rows.' },
    review: { es: 'Ancho de franja según tu maquinaria.', en: 'Strip width to match your machinery.' },
  },
  'wheat-clover': {
    zones: ['continental', 'subtropical', 'mediterranean'],
    strong: true,
    name: { es: 'Trigo con trébol sembrado al voleo', en: 'Wheat with frost-seeded clover' },
    rationale: {
      es: 'El trébol se siembra sobre el trigo a fin de invierno y sigue cubriendo el suelo después de la cosecha, dejando nitrógeno.',
      en: 'Clover is broadcast into wheat in late winter and keeps covering the soil after harvest, leaving nitrogen.',
    },
    benefit: { es: 'Cobertura casi gratis: no necesita una siembra aparte con tractor.', en: 'Nearly free cover: no separate tractor pass.' },
    risk: { es: 'Si el trigo es muy denso el trébol nace poco.', en: 'If the wheat is too dense, clover establishes poorly.' },
    review: { es: 'Dosis y fecha de siembra del trébol.', en: 'Clover seeding rate and date.' },
  },
};

/** Una asociación de la UI convertida en sistema: el primer miembro manda el calendario, los demás van con él. */
function guildSystem(g: Guild): SystemTpl | null {
  const text = GUILD_TEXT[g.id];
  if (!text || g.coolSeason) return null;
  const slots: Slot[] = g.members.map((m, i): Slot => {
    const t = crop(m.crop).t;
    if (t.perennial) return { crop: m.crop, role: m.role === 'cover' ? 'cover' : 'perennial', at: 'all' };
    if (i === 0) return { crop: m.crop, role: 'cash', at: t.frostOk ? 'cool' : 'main' };
    // En el trébol sobre el trigo (sowWeek 12) la siembra va meses después; en la milpa, semanas.
    return { crop: m.crop, role: t.food ? 'intercrop' : 'cover', at: { with: 0, offset: Math.round(m.sowWeek / 4.3) } };
  });
  return {
    id: g.id,
    kind: 'mixed',
    zones: text.zones,
    years: 1,
    slots,
    strong: text.strong,
    ifCurrentHas: text.ifCurrentHas,
    name: text.name,
    rationale: text.rationale,
    benefits: [text.benefit],
    risks: [text.risk],
    review: [text.review],
  };
}

export const MIXED: SystemTpl[] = GUILDS.map(guildSystem).filter((s): s is SystemTpl => s !== null);

/** Mezclas de cobertura de la época fresca (para el hueco de la rotación actual). */
export const COVER_MIXES: { id: string; crops: CropId[] }[] = GUILDS.filter((g) => g.coolSeason).map((g) => ({
  id: g.id,
  crops: g.members.map((m) => m.crop),
}));

/** Coberturas anuales de una sola especie, de clima fresco y cálido, para el hueco entre cosechas. */
export const SINGLE_COVERS: CropId[] = ['rye', 'vetch', 'oats', 'clover', 'radish', 'cowpea', 'mungbean'];

/** Leguminosas que se pueden intercalar con un cultivo principal. */
export const INTERCROP_LEGUMES: CropId[] = ['beans', 'cowpea', 'pigeonpea', 'groundnut', 'soybean'];

export const SYSTEMS: SystemTpl[] = [...ROTATIONS, ...MIXED];
