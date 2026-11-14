import type { CropId } from '@/lib/api/contract';
import { canSupport, coversGround, cycleClassOf, traitsOf, type CropTraits } from './traits';

/**
 * Cómo se llevan dos cultivos sembrados juntos.
 *  - Parejas conocidas (curadas): asociaciones tradicionales con respaldo (milpa, yuca con leguminosas,
 *    mijo con caupí, café con sombrío…). Valen ±1 por razón.
 *  - El resto se deduce de los rasgos (altura, raíces, ciclo, familia, abono): valen ±0,5 por razón.
 * Valor de la pareja entre −2 y +2.
 */

export type HelpReason = 'support' | 'nitrogen' | 'groundCover' | 'shade' | 'roots' | 'time';
export type CareReason = 'sharedPests' | 'light' | 'nutrients' | 'allelopathy' | 'water';
export type ReasonId = HelpReason | CareReason;

/** Una razón con dirección: `from` le da algo a `to` (o le quita, si es de cuidado). */
export type Reason = { id: ReasonId; kind: 'helps' | 'careful'; from: CropId; to: CropId };

export type PairRelation = {
  a: CropId;
  b: CropId;
  value: number;
  kind: 'helps' | 'careful' | 'neutral';
  reasons: Reason[];
  /** Asociación conocida (no solo deducida de los rasgos). */
  curated: boolean;
};

type Curated = { helps?: HelpReason[]; careful?: CareReason[] };

const key = (a: CropId, b: CropId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Asociaciones tradicionales y bien documentadas en extensión agrícola. */
const CURATED: Record<string, Curated> = {
  // Milpa / tres hermanas (Mesoamérica y Norteamérica)
  [key('maize', 'beans')]: { helps: ['support', 'nitrogen'] },
  [key('maize', 'squash')]: { helps: ['groundCover'] },
  [key('beans', 'squash')]: { helps: ['nitrogen', 'groundCover'] },
  // Yuca con maíz y leguminosas (trópico de América y África)
  [key('maize', 'cassava')]: { helps: ['time'] },
  [key('cassava', 'beans')]: { helps: ['nitrogen', 'time'] },
  [key('cassava', 'cowpea')]: { helps: ['nitrogen', 'groundCover'] },
  [key('cassava', 'groundnut')]: { helps: ['nitrogen', 'groundCover'] },
  [key('cassava', 'squash')]: { helps: ['groundCover', 'time'] },
  // Cereales con leguminosas
  [key('maize', 'cowpea')]: { helps: ['nitrogen', 'groundCover'] },
  [key('maize', 'pigeonpea')]: { helps: ['nitrogen', 'roots', 'time'] },
  [key('maize', 'groundnut')]: { helps: ['nitrogen', 'groundCover'] },
  [key('maize', 'soybean')]: { helps: ['nitrogen'], careful: ['light'] },
  [key('sorghum', 'cowpea')]: { helps: ['nitrogen', 'groundCover'] },
  [key('sorghum', 'pigeonpea')]: { helps: ['nitrogen', 'roots', 'time'] },
  [key('sorghum', 'groundnut')]: { helps: ['nitrogen'] },
  [key('millet', 'cowpea')]: { helps: ['nitrogen', 'groundCover'] },
  [key('millet', 'groundnut')]: { helps: ['nitrogen'] },
  [key('pigeonpea', 'groundnut')]: { helps: ['roots', 'time'] },
  [key('sugarcane', 'beans')]: { helps: ['nitrogen', 'time'] },
  [key('sugarcane', 'soybean')]: { helps: ['nitrogen', 'time'] },
  [key('sugarcane', 'groundnut')]: { helps: ['nitrogen', 'time'] },
  [key('cotton', 'cowpea')]: { helps: ['nitrogen'] },
  [key('cotton', 'groundnut')]: { helps: ['nitrogen'] },
  // Café agroforestal
  [key('coffee', 'shade-trees')]: { helps: ['shade', 'nitrogen'] },
  [key('coffee', 'plantain')]: { helps: ['shade', 'time'] },
  [key('coffee', 'beans')]: { helps: ['nitrogen', 'time'] },
  [key('coffee', 'forage-peanut')]: { helps: ['groundCover', 'nitrogen'] },
  [key('plantain', 'forage-peanut')]: { helps: ['groundCover', 'nitrogen'] },
  [key('plantain', 'shade-trees')]: { helps: ['roots'] },
  // Coberturas y forrajes de clima frío
  [key('oats', 'vetch')]: { helps: ['support', 'nitrogen'] },
  [key('rye', 'vetch')]: { helps: ['support', 'nitrogen'] },
  [key('rye', 'clover')]: { helps: ['nitrogen', 'groundCover'] },
  [key('oats', 'clover')]: { helps: ['nitrogen'] },
  [key('rye', 'radish')]: { helps: ['roots'] },
  [key('oats', 'radish')]: { helps: ['roots'] },
  [key('vetch', 'radish')]: { helps: ['roots'] },
  [key('wheat', 'clover')]: { helps: ['nitrogen', 'groundCover'] },
  [key('barley', 'clover')]: { helps: ['nitrogen'] },
  [key('alfalfa', 'oats')]: { helps: ['time'] },
  // Combinaciones que conviene evitar
  [key('maize', 'sorghum')]: { careful: ['sharedPests', 'light'] },
  [key('maize', 'millet')]: { careful: ['sharedPests', 'light'] },
  [key('sorghum', 'millet')]: { careful: ['sharedPests'] },
  [key('maize', 'sugarcane')]: { careful: ['sharedPests', 'light'] },
  [key('sorghum', 'sugarcane')]: { careful: ['sharedPests'] },
  [key('potato', 'sunflower')]: { careful: ['allelopathy'] },
  // El girasol sirve de tutor, pero sus raíces frenan al frijol: se compensa.
  [key('sunflower', 'beans')]: { helps: ['support'], careful: ['allelopathy'] },
};

export function isCurated(a: CropId, b: CropId): boolean {
  return key(a, b) in CURATED;
}

/** Dirección de cada razón según los rasgos: quién da y quién recibe. */
function direct(id: ReasonId, a: CropId, ta: CropTraits, b: CropId, tb: CropTraits): [CropId, CropId] {
  const ab: [CropId, CropId] = [a, b];
  const ba: [CropId, CropId] = [b, a];
  switch (id) {
    case 'support':
      return tb.habit === 'climber' ? ab : ta.habit === 'climber' ? ba : ta.heightM >= tb.heightM ? ab : ba;
    case 'nitrogen':
      return ta.nFix && !tb.nFix ? ab : tb.nFix && !ta.nFix ? ba : ab;
    case 'groundCover':
      return ta.heightM <= tb.heightM ? ab : ba;
    case 'shade':
    case 'light':
      return ta.heightM >= tb.heightM ? ab : ba;
    case 'roots':
      return ta.rootM <= tb.rootM ? ab : ba;
    case 'time':
      return ta.cycleDays <= tb.cycleDays ? ab : ba;
    case 'water':
      return ta.waterlog === 'high' ? ab : ba;
    case 'allelopathy':
      return a === 'sunflower' ? ab : b === 'sunflower' ? ba : ab;
    default:
      return ab;
  }
}

/** Razones deducidas de los rasgos (para parejas que no son asociaciones conocidas). */
function derived(ta: CropTraits, tb: CropTraits): Curated {
  const helps: HelpReason[] = [];
  const careful: CareReason[] = [];
  const [tall, short] = ta.heightM >= tb.heightM ? [ta, tb] : [tb, ta];

  if (ta.nFix !== tb.nFix && (ta.nFix ? tb : ta).feeder !== 'light') helps.push('nitrogen');
  if ((coversGround(short) || short.habit === 'creeper') && tall.heightM >= 1.2) helps.push('groundCover');
  if (short.habit === 'climber' && canSupport(tall)) helps.push('support');
  if (Math.abs(ta.rootM - tb.rootM) >= 0.6) helps.push('roots');
  if (cycleClassOf(ta) !== cycleClassOf(tb)) helps.push('time');
  if (tall.habit === 'tree' && short.shade !== 'low') helps.push('shade');

  if (ta.family === tb.family && ta.family !== 'mixed') careful.push('sharedPests');
  const bothTall = ta.heightM >= 1.5 && tb.heightM >= 1.5 && ta.habit !== 'climber' && tb.habit !== 'climber';
  const shadesOut = tall.heightM - short.heightM >= 1 && short.shade === 'low' && short.habit !== 'climber';
  if ((bothTall && tall.habit !== 'tree') || shadesOut) careful.push('light');
  if (ta.feeder === 'heavy' && tb.feeder === 'heavy' && !ta.nFix && !tb.nFix) careful.push('nutrients');
  if ((ta.waterlog === 'high') !== (tb.waterlog === 'high') && (ta.waterlog === 'low' || tb.waterlog === 'low')) careful.push('water');

  return { helps, careful };
}

export function pairRelation(a: CropId, b: CropId): PairRelation {
  const ta = traitsOf(a);
  const tb = traitsOf(b);
  if (!ta || !tb || a === b) return { a, b, value: 0, kind: 'neutral', reasons: [], curated: false };

  const curated = CURATED[key(a, b)];
  const src = curated ?? derived(ta, tb);
  const step = curated ? 1 : 0.5;
  const reasons: Reason[] = [
    ...(src.helps ?? []).map((id): Reason => {
      const [from, to] = direct(id, a, ta, b, tb);
      return { id, kind: 'helps', from, to };
    }),
    ...(src.careful ?? []).map((id): Reason => {
      const [from, to] = direct(id, a, ta, b, tb);
      return { id, kind: 'careful', from, to };
    }),
  ];
  const raw = step * ((src.helps?.length ?? 0) - (src.careful?.length ?? 0));
  const value = Math.max(-2, Math.min(2, raw));
  const kind = value > 0.25 ? 'helps' : value < -0.25 ? 'careful' : 'neutral';
  return { a, b, value, kind, reasons, curated: Boolean(curated) };
}

/** Todas las parejas de una mezcla. */
export function pairsOf(crops: readonly CropId[]): PairRelation[] {
  const out: PairRelation[] = [];
  for (let i = 0; i < crops.length; i++) for (let j = i + 1; j < crops.length; j++) out.push(pairRelation(crops[i]!, crops[j]!));
  return out;
}
