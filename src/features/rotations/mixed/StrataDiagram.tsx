'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { CROPS } from '@/features/field/crops';
import type { CropId } from '@/lib/api/contract';
import { useUnits } from '@/lib/units';
import { useCropThe } from './parts';
import type { SpaceUse } from './planner';
import { STRATA, STRATUM_TOP, stratumOf, traitsOf, rootLayerOf } from './traits';

const W = 340;
const H = 270;
const LEFT = 46;
const RIGHT = 6;
const TOP = 22;
const GROUND = 168;
const SOIL_BOTTOM = H - 26;

/**
 * Perfil de la mezcla: cada planta con su altura (arriba) y la profundidad de sus raíces (abajo).
 * Escala de raíz cuadrada para alturas (una planta de 0,5 m sigue viéndose junto a un árbol de 10 m).
 * El texto equivalente va en <desc> y, con `list`, en una lista visible debajo.
 */
export function StrataDiagram({ space, title, list = false }: { space: SpaceUse; title: string; list?: boolean }) {
  const t = useTranslations('mixed.strata');
  const tc = useTranslations('crops');
  const u = useUnits();
  const the = useCropThe();
  const uid = useId();
  const crops = space.foliage.map((b) => b.crop);
  const n = Math.max(1, crops.length);
  const colW = (W - LEFT - RIGHT) / n;
  const yUp = (h: number) => GROUND - (GROUND - TOP) * Math.sqrt(Math.max(0, h) / space.heightRef);
  const yDown = (d: number) => GROUND + (SOIL_BOTTOM - 4 - GROUND) * Math.min(1, d / space.rootRef);

  const rows = crops.map((c) => {
    const tr = traitsOf(c)!;
    const band = space.foliage.find((b) => b.crop === c)!;
    return {
      crop: c,
      text: t('row', {
        crop: tc(c),
        height: u.length(band.to),
        depth: u.length(tr.rootM),
        level: t(`levels.${stratumOf(band.to)}`),
        roots: t(`rootLayers.${rootLayerOf(tr.rootM)}`),
      }),
      extra: tr.habit === 'climber' ? (space.support ? t('climbsOn', { crop: the(space.support) }) : t('needsSupport')) : null,
    };
  });

  const guides = STRATA.filter((s) => STRATUM_TOP[s] < space.heightRef);

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t ${uid}-d`}
        className="h-auto w-full overflow-visible rounded-2xl bg-gradient-to-b from-sky-glow/10 to-transparent"
      >
        <title id={`${uid}-t`}>{title}</title>
        <desc id={`${uid}-d`}>
          {t('diagramLabel')} {rows.map((r) => `${r.text}${r.extra ? ` (${r.extra})` : ''}.`).join(' ')}
        </desc>

        {/* Pisos de altura */}
        {guides.map((s) => (
          <g key={s}>
            <line x1={LEFT - 4} x2={W - RIGHT} y1={yUp(STRATUM_TOP[s])} y2={yUp(STRATUM_TOP[s])} className="stroke-white/15" strokeDasharray="3 4" />
            <text x={LEFT - 6} y={yUp(STRATUM_TOP[s]) + 3} textAnchor="end" className="fill-ink-faint text-[9px]">
              {u.length(STRATUM_TOP[s])}
            </text>
          </g>
        ))}
        <text x={4} y={GROUND - 6} className="fill-ink-muted text-[9px] font-semibold">
          {t('levels.ground')}
        </text>
        <text x={4} y={TOP + 8} className="fill-ink-muted text-[9px] font-semibold">
          {t('up')}
        </text>

        {/* Suelo */}
        <rect x={0} y={GROUND} width={W} height={SOIL_BOTTOM - GROUND} rx={6} className="fill-[#6b4a2f]/35" />
        <line x1={0} x2={W} y1={GROUND} y2={GROUND} className="stroke-[#a0784f]" strokeWidth={2} />
        <text x={4} y={SOIL_BOTTOM - 6} className="fill-ink-muted text-[9px] font-semibold">
          {t('down')}
        </text>

        {crops.map((c, i) => {
          const tr = traitsOf(c)!;
          const band = space.foliage.find((b) => b.crop === c)!;
          const root = space.roots.find((b) => b.crop === c)!;
          const color = CROPS[c].color;
          const cx = LEFT + colW * (i + 0.5);
          const top = yUp(band.to);
          const bottom = yUp(band.from);
          const rx = Math.min(colW * 0.44, 8 + tr.spreadM * 14);
          const tip = yDown(root.to);
          const rootW = Math.min(colW * 0.32, 6 + (tr.rootM < 0.7 ? 18 : 10));
          return (
            <g key={c}>
              {/* Raíces */}
              <motion.g initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }} style={{ originY: 0 }}>
                <path
                  d={`M ${cx - rootW} ${GROUND} Q ${cx - rootW * 0.4} ${(GROUND + tip) / 2} ${cx} ${tip} Q ${cx + rootW * 0.4} ${(GROUND + tip) / 2} ${cx + rootW} ${GROUND} Z`}
                  fill={`${color}40`}
                  stroke={`${color}aa`}
                  strokeWidth={1}
                />
                <line x1={cx} x2={cx} y1={GROUND} y2={tip} stroke={`${color}cc`} strokeWidth={1.2} />
              </motion.g>
              <text x={cx} y={Math.min(tip + 11, SOIL_BOTTOM - 2)} textAnchor="middle" className="fill-ink text-[9px]">
                {u.length(tr.rootM)}
              </text>

              {/* Parte aérea */}
              <motion.g initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.55, delay: i * 0.08 }} style={{ originY: 1 }}>
                <Plant habit={tr.habit} cx={cx} top={top} bottom={bottom} rx={rx} color={color} supportTop={space.support && tr.habit === 'climber' ? top : null} />
              </motion.g>
              <text x={cx} y={top - 5} textAnchor="middle" className="fill-ink text-[10px] font-semibold">
                {u.length(band.to)}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
                {tc(c).length > 14 ? `${tc(c).slice(0, 13)}…` : tc(c)}
              </text>
            </g>
          );
        })}
      </svg>
      {list && (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.crop} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: CROPS[r.crop as CropId].color }} />
              <span>
                {r.text}
                {r.extra && <span className="text-ink-muted"> · {r.extra}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function Plant({
  habit,
  cx,
  top,
  bottom,
  rx,
  color,
  supportTop,
}: {
  habit: NonNullable<ReturnType<typeof traitsOf>>['habit'];
  cx: number;
  top: number;
  bottom: number;
  rx: number;
  color: string;
  supportTop: number | null;
}) {
  const fill = `${color}cc`;
  const stem = `${color}`;
  const mid = (top + bottom) / 2;
  const ry = Math.max(4, (bottom - top) / 2);
  switch (habit) {
    case 'creeper':
      return (
        <g>
          <ellipse cx={cx} cy={GROUND - ry} rx={rx} ry={ry} fill={fill} />
          {[-0.55, 0, 0.55].map((k) => (
            <circle key={k} cx={cx + rx * k} cy={GROUND - ry * 1.3} r={Math.max(3, ry * 0.7)} fill={`${color}ee`} />
          ))}
        </g>
      );
    case 'grass':
      return (
        <g stroke={stem} strokeWidth={2} strokeLinecap="round">
          {[-0.8, -0.4, 0, 0.4, 0.8].map((k) => (
            <line key={k} x1={cx + k * rx * 0.3} y1={GROUND} x2={cx + k * rx} y2={top + Math.abs(k) * 10} />
          ))}
        </g>
      );
    case 'tree':
      return (
        <g>
          <line x1={cx} x2={cx} y1={GROUND} y2={mid} stroke="#8a6a48" strokeWidth={5} strokeLinecap="round" />
          <ellipse cx={cx} cy={mid} rx={rx} ry={ry} fill={fill} />
        </g>
      );
    case 'climber': {
      // Enredadera en zigzag; con tutor, junto a un poste que marca dónde trepa.
      const steps = 7;
      const h = GROUND - top;
      const d = Array.from({ length: steps + 1 }, (_, k) => `${k === 0 ? 'M' : 'L'} ${cx + (k % 2 ? 6 : -6)} ${GROUND - (h * k) / steps}`).join(' ');
      return (
        <g>
          {supportTop != null && <line x1={cx + 10} x2={cx + 10} y1={GROUND} y2={supportTop} className="stroke-white/30" strokeDasharray="2 3" strokeWidth={1.5} />}
          <path d={d} fill="none" stroke={stem} strokeWidth={2} strokeLinejoin="round" />
          {Array.from({ length: steps }, (_, k) => (
            <circle key={k} cx={cx + (k % 2 ? -8 : 8)} cy={GROUND - (h * (k + 0.5)) / steps} r={3.5} fill={fill} />
          ))}
        </g>
      );
    }
    case 'bush':
      return (
        <g>
          <line x1={cx} x2={cx} y1={GROUND} y2={mid} stroke={stem} strokeWidth={2} />
          <ellipse cx={cx} cy={mid} rx={rx} ry={ry} fill={fill} />
        </g>
      );
    case 'erect':
    default:
      return (
        <g>
          <line x1={cx} x2={cx} y1={GROUND} y2={top} stroke={stem} strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={cx} cy={mid} rx={Math.max(6, rx * 0.8)} ry={ry} fill={fill} />
          <line x1={cx} x2={cx} y1={GROUND} y2={top} stroke={stem} strokeWidth={1.5} />
        </g>
      );
  }
}
