'use client';

import clsx from 'clsx';
import {
  CalendarDays,
  Check,
  CloudLightning,
  CloudRain,
  Droplets,
  Flame,
  History,
  Layers,
  Leaf,
  LocateFixed,
  MapPin,
  Mic,
  Play,
  Pointer,
  Printer,
  Radio,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sprout,
  Store,
  Sun,
  Thermometer,
  Trophy,
  Volume2,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { buzz, GameStyles, useLater } from '@/features/onboarding/games/ui';
import { pointsFor } from '@/lib/points';
import { useUnits } from '@/lib/units';
import { simStart, type Lesson, type SimState, type Step, type Zone } from './lessons';

/** Rectángulos (en % del teléfono) de cada lugar: copian la pantalla real en móvil. */
const RECT: Record<Zone, { l: number; t: number; w: number; h: number }> = {
  search: { l: 4, t: 2.5, w: 13, h: 7 },
  points: { l: 41, t: 2.5, w: 21, h: 7 },
  settings: { l: 64.5, t: 2.5, w: 13, h: 7 },
  layers: { l: 81, t: 2.5, w: 15, h: 7 },
  timeChip: { l: 28, t: 12, w: 44, h: 6 },
  locationChip: { l: 12, t: 20, w: 76, h: 6.5 },
  globe: { l: 14, t: 31, w: 72, h: 38 },
  crosshair: { l: 43.5, t: 46.5, w: 13, h: 7 },
  locate: { l: 82, t: 66, w: 13, h: 7 },
  myFarm: { l: 4, t: 74, w: 38, h: 7 },
  radio: { l: 4, t: 83, w: 92, h: 7.5 },
  chat: { l: 4, t: 92, w: 92, h: 6.5 },
};

const pos = ({ l, t, w, h }: (typeof RECT)[Zone]): CSSProperties => ({ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` });

/**
 * Simulador de la pantalla de Field Shift (una maqueta, no la app): cada paso de la lección dice qué tocar, eso
 * brilla con una mano encima y, al tocarlo, pasa lo mismo que en la app (se abre el panel, se pinta la capa…).
 * Solo lo que hay que tocar es un botón (≥ 44 px, con la instrucción como nombre): con teclado basta Tab + Enter.
 */
export function PhoneSim({ lesson, say, onDone }: { lesson: Lesson; say: (text: string) => void; onDone: () => void }) {
  const t = useTranslations('academy');
  const later = useLater();
  const [step, setStep] = useState(0);
  const [sim, setSim] = useState<SimState>(() => simStart(lesson));
  const total = lesson.steps.length;
  const finished = step >= total;
  const current: Step | null = finished ? null : lesson.steps[step]!;
  const instruction = finished ? t('lesson.simDone') : t(`lessons.${lesson.id}.steps.${step}`);

  useEffect(() => say(t(`lessons.${lesson.id}.steps.0`)), [say, t, lesson.id]);

  const tap = () => {
    if (!current) return;
    buzz('ok');
    if (current.then) setSim((s) => ({ ...s, ...current.then }));
    const next = step + 1;
    setStep(next);
    if (next >= total) {
      say(t('lesson.simDone'));
      later(onDone, 1100);
    } else say(t(`lessons.${lesson.id}.steps.${next}`));
  };

  const replay = () => {
    setStep(0);
    setSim(simStart(lesson));
    say(t(`lessons.${lesson.id}.steps.0`));
  };

  const target = (z: Zone) => !!current && current.zone === z;
  const item = current?.item ?? null;

  return (
    <div className="flex flex-col gap-2">
      <GameStyles />
      <style>{`@keyframes acad-tap{0%,100%{transform:translate(-10%,10%)}50%{transform:translate(-10%,-14%)}}.acad-tap{animation:acad-tap 1.1s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.acad-tap{animation:none}}`}</style>
      <div aria-live="polite" className="flex items-start gap-2.5 rounded-2xl bg-sun/10 p-3 ring-2 ring-sun/60">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sun text-black">
          {finished ? <Check aria-hidden className="size-5" /> : <Pointer aria-hidden className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold tracking-wider text-sun uppercase">
            {finished ? t('lesson.simDoneKicker') : t('lesson.stepOf', { n: step + 1, total })}
          </span>
          <span className="block text-base leading-snug font-semibold">{instruction}</span>
        </span>
      </div>

      <div
        role="group"
        aria-label={t('sim.label')}
        className="relative mx-auto aspect-[9/17] w-full max-w-[16.5rem] overflow-hidden rounded-[2rem] bg-[#05070d] shadow-xl ring-4 ring-white/15"
      >
        <SimGlobe tint={sim.tint} />
        <Mock zone="search" active={target('search')}>
          <Round>
            <Search className="size-4" />
          </Round>
        </Mock>
        <Mock zone="points" active={target('points')}>
          <Pill>
            <Trophy className="size-3.5 text-sun" />
            <b>10</b>
          </Pill>
        </Mock>
        <Mock zone="settings" active={target('settings')}>
          <Round>
            <Settings className="size-4" />
          </Round>
        </Mock>
        <Mock zone="layers" active={target('layers')}>
          <Round>
            <Layers className="size-4" />
          </Round>
        </Mock>
        <Mock zone="timeChip" active={target('timeChip')}>
          <Pill>
            <History className="size-3" />
            {sim.tint === 'past' ? t('sim.timePast') : t('sim.time')}
          </Pill>
        </Mock>
        <Mock zone="locationChip" active={target('locationChip')}>
          <Pill>
            <MapPin className="size-3 text-field-300" />
            {t('sim.location')}
          </Pill>
        </Mock>
        <Mock zone="crosshair" active={target('crosshair')}>
          <span className="relative grid size-full place-items-center">
            <span className="size-6 rounded-full ring-2 ring-white/80" />
            <span className="absolute size-1.5 rounded-full bg-white" />
          </span>
        </Mock>
        <Mock zone="locate" active={target('locate')}>
          <Round>
            <LocateFixed className="size-4" />
          </Round>
        </Mock>
        <Mock zone="myFarm" active={target('myFarm')}>
          <Pill wide>
            <Sprout className="size-3.5 text-field-300" />
            {t('sim.myFarm')}
          </Pill>
        </Mock>
        <Mock zone="radio" active={target('radio')}>
          <Bar>
            <span className="grid size-5 place-items-center rounded-full bg-field-500 text-black">
              <Play className="size-3" />
            </span>
            <Radio className="size-3 text-ink-muted" />
            <span className="truncate">{t('sim.radio')}</span>
          </Bar>
        </Mock>
        <Mock zone="chat" active={target('chat')}>
          <Bar>
            <span className="flex-1 truncate text-ink-muted">{t('sim.ask')}</span>
            <Mic className="size-3.5" />
          </Bar>
        </Mock>

        {sim.panel && <SimPanel sim={sim} item={item} onTap={tap} />}

        {/* Lo que hay que tocar ahora: botón real (≥ 44 px) encima del lugar, con la mano que señala. */}
        {current?.zone && (
          <button
            type="button"
            onClick={tap}
            aria-label={instruction}
            style={{
              left: `${RECT[current.zone].l + RECT[current.zone].w / 2}%`,
              top: `${RECT[current.zone].t + RECT[current.zone].h / 2}%`,
              width: `max(${RECT[current.zone].w}%, 2.75rem)`,
              height: `max(${RECT[current.zone].h}%, 2.75rem)`,
            }}
            className={clsx(
              // El brillo (fsq-glow) usa box-shadow: el borde fijo va con outline para no perderse.
              'fsq-glow absolute z-30 -translate-x-1/2 -translate-y-1/2 outline-3 outline-offset-0 outline-sun outline-solid',
              'focus-visible:animate-none focus-visible:outline-white',
              current.zone === 'globe' ? 'rounded-full' : 'rounded-2xl',
            )}
          >
            <Hand />
          </button>
        )}
      </div>

      {finished && (
        <button
          type="button"
          onClick={replay}
          className="flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-white/10"
        >
          <RotateCcw aria-hidden className="size-4" />
          {t('lesson.replay')}
        </button>
      )}
    </div>
  );
}

function Hand() {
  return (
    <span aria-hidden className="acad-tap pointer-events-none absolute -right-3 -bottom-4 z-10 grid size-7 place-items-center rounded-full bg-sun text-black shadow-lg ring-2 ring-black/40">
      <Pointer className="size-4" />
    </span>
  );
}

/** Un lugar de la maqueta (decorativo; si es el objetivo, se resalta y el botón va encima). */
function Mock({ zone, active, children }: { zone: Zone; active: boolean; children: ReactNode }) {
  return (
    <div aria-hidden style={pos(RECT[zone])} className={clsx('absolute z-10 flex items-center justify-center', active && 'z-20')}>
      {children}
    </div>
  );
}

const Round = ({ children }: { children: ReactNode }) => (
  <span className="grid aspect-square h-full place-items-center rounded-full bg-surface-strong/90 text-ink ring-1 ring-line">{children}</span>
);
const Pill = ({ children, wide }: { children: ReactNode; wide?: boolean }) => (
  <span
    className={clsx(
      'flex h-full items-center gap-1 rounded-full bg-surface-strong/90 px-2 text-[10px] font-semibold whitespace-nowrap text-ink ring-1 ring-line',
      wide && 'w-full justify-center ring-field-500/60',
    )}
  >
    {children}
  </span>
);
const Bar = ({ children }: { children: ReactNode }) => (
  <span className="flex size-full items-center gap-1.5 rounded-xl bg-surface-strong/95 px-2 text-[10px] font-semibold text-ink ring-1 ring-line">
    {children}
  </span>
);

/** El globo de la maqueta y cómo se ve según la lección (capa, zoom a la finca, fecha pasada…). */
function SimGlobe({ tint }: { tint: SimState['tint'] }) {
  const t = useTranslations('academy.sim');
  const zoom = tint === 'zoom';
  return (
    <div aria-hidden style={pos(RECT.globe)} className="absolute">
      <div
        className={clsx(
          'relative size-full overflow-hidden rounded-full shadow-[0_0_40px_rgb(124_196_255/0.25)] transition-transform duration-700',
          zoom && 'scale-[1.3]',
          tint === 'past' && 'sepia-[.6]',
        )}
        style={{ background: 'radial-gradient(circle at 35% 30%, #2b5a8c 0%, #13304f 55%, #071526 100%)' }}
      >
        {/* Continentes (manchas) */}
        <span className="absolute top-[18%] left-[18%] h-[38%] w-[30%] rotate-12 rounded-[45%] bg-[#3f6b3a]" />
        <span className="absolute top-[46%] left-[30%] h-[36%] w-[22%] -rotate-12 rounded-[45%] bg-[#4d7a3c]" />
        <span className="absolute top-[22%] left-[58%] h-[44%] w-[24%] rotate-6 rounded-[45%] bg-[#7a6a3a]" />
        {tint === 'moisture' && <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgb(60_140_255/0.85),rgb(60_140_255/0.15)_45%,rgb(255_180_60/0.55)_75%)]" />}
        {tint === 'risk' && (
          <>
            <span className="absolute top-[30%] left-[25%] size-[22%] rounded-full bg-risk-high/80 blur-[2px]" />
            <span className="absolute top-[52%] left-[38%] size-[18%] rounded-full bg-risk-medium/80 blur-[2px]" />
            <span className="absolute top-[28%] left-[55%] size-[20%] rounded-full bg-risk-low/70 blur-[2px]" />
          </>
        )}
        {tint === 'events' &&
          [
            [30, 35],
            [55, 55],
            [42, 22],
          ].map(([x, y]) => <Flame key={`${x}-${y}`} className="absolute size-4 text-risk-high" style={{ left: `${x}%`, top: `${y}%` }} />)}
        {tint === 'shop' &&
          [
            [28, 40],
            [44, 58],
            [60, 32],
          ].map(([x, y]) => (
            <span key={`${x}-${y}`} className="absolute grid size-5 place-items-center rounded-full bg-field-500 text-black" style={{ left: `${x}%`, top: `${y}%` }}>
              <Store className="size-3" />
            </span>
          ))}
        {/* Puntos que pulsan (fincas de ejemplo, emisoras) */}
        {!zoom &&
          [
            [32, 30],
            [40, 62],
            [64, 46],
          ].map(([x, y]) => (
            <span key={`${x}-${y}`} className="absolute size-2 rounded-full bg-sun shadow-[0_0_8px_rgb(255_209_102)]" style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
      </div>
      {zoom && (
        <span className="absolute top-[38%] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">
          <MapPin className="size-3 text-field-300" />
          {t('yourFarm')}
        </span>
      )}
      {tint === 'past' && (
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-sun px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-black">
          {t('timePast')}
        </span>
      )}
    </div>
  );
}

/** Fila de un panel: si es lo que hay que tocar, es un botón que brilla; si no, es solo dibujo. */
function Row({ id, item, onTap, Icon, children, className }: { id: string; item: string | null; onTap: () => void; Icon?: LucideIcon; children: ReactNode; className?: string }) {
  const content = (
    <>
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 text-left">{children}</span>
    </>
  );
  const cls = clsx('flex min-h-7 w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] font-semibold', className);
  if (item !== id) return <div className={clsx(cls, 'bg-white/5')}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onTap}
      className={clsx(cls, 'fsq-glow relative min-h-11 bg-sun/20 outline-2 outline-sun outline-solid focus-visible:animate-none focus-visible:outline-white')}
    >
      {content}
      <Hand />
    </button>
  );
}

function SimPanel({ sim, item, onTap }: { sim: SimState; item: string | null; onTap: () => void }) {
  const t = useTranslations('academy.sim');
  const tl = useTranslations('layers.items');
  const te = useTranslations('events');
  const tshop = useTranslations('listings');
  const format = useFormatter();
  const units = useUnits();
  const pct = (v: number) => format.number(v / 100, { style: 'percent', maximumFractionDigits: 0 });
  const r = { item, onTap };

  const sheet = (title: string, children: ReactNode, Icon?: LucideIcon) => (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col gap-1 rounded-t-2xl bg-surface-strong p-2 pb-3 ring-1 ring-line">
      <span aria-hidden className="mx-auto h-1 w-8 rounded-full bg-white/30" />
      <p className="flex items-center gap-1 text-[11px] font-bold">
        {Icon && <Icon aria-hidden className="size-3.5" />}
        {title}
      </p>
      {children}
    </div>
  );
  const drawer = (title: string, children: ReactNode) => (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[80%] flex-col gap-1 rounded-l-2xl bg-surface-strong p-2 pt-4 ring-1 ring-line">
      <p className="text-[11px] font-bold">{title}</p>
      {children}
    </div>
  );

  switch (sim.panel) {
    case 'search':
      return (
        <div className="absolute inset-x-0 top-0 z-20 flex flex-col gap-1 bg-surface-strong p-2 ring-1 ring-line">
          <p className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px]">
            <Search aria-hidden className="size-3" />
            {t('search.typed')}
          </p>
          <Row id="result" {...r} Icon={MapPin}>
            {t('search.result')}
          </Row>
        </div>
      );
    case 'region':
      return drawer(
        t('region.title'),
        <>
          <Row id="row" {...r} Icon={Droplets}>
            {t('region.moisture')} · <b>{pct(22)}</b> <span className="text-ink-muted">SMAP</span>
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={CloudRain}>
            {t('region.rain')} · <b>{units.rain(180)}</b> <span className="text-ink-muted">GPM</span>
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Leaf}>
            {t('region.ndvi')} · <b>{format.number(0.71, { minimumFractionDigits: 2 })}</b> <span className="text-ink-muted">MODIS</span>
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Thermometer}>
            {t('region.heat')} · <b>{units.temp(27)}</b> <span className="text-ink-muted">MODIS</span>
          </Row>
        </>,
      );
    case 'risk':
      return drawer(
        t('risk.title'),
        <>
          {(
            [
              ['drought', 'high'],
              ['water', 'low'],
              ['heat', 'mid'],
              ['soil', 'mid'],
            ] as const
          ).map(([k, lvl]) => (
            <Row key={k} id="-" item={null} onTap={onTap} Icon={ShieldAlert}>
              {t(`risk.${k}`)} · <b>{t(`risk.level.${lvl}`)}</b>
            </Row>
          ))}
          <Row id="change" {...r} Icon={Waves}>
            {t('risk.change')}
          </Row>
        </>,
      );
    case 'layers':
      return sheet(
        t('layers.title'),
        <>
          <Row id="ndvi" {...r} Icon={Leaf}>
            {tl('ndvi.name')}
          </Row>
          <Row id="soil-moisture" {...r} Icon={Droplets}>
            {tl('soil-moisture.name')}
          </Row>
          <Row id="risk" {...r} Icon={ShieldAlert}>
            {tl('risk.name')}
          </Row>
          <Row id="events" {...r} Icon={Flame}>
            {te('layerName')}
          </Row>
          <Row id="shop" {...r} Icon={Store}>
            {tshop('layerName')}
          </Row>
        </>,
        Layers,
      );
    case 'time':
      return sheet(
        t('time'),
        <div className="grid grid-cols-2 gap-1">
          <Row id="-" item={null} onTap={onTap} Icon={CalendarDays}>
            {t('timeNow')}
          </Row>
          <Row id="past" {...r} Icon={History}>
            {t('timePast')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={History}>
            {format.dateTime(new Date(2015, 9, 1), { month: 'short', year: 'numeric' })}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={History}>
            {format.dateTime(new Date(1998, 2, 1), { month: 'short', year: 'numeric' })}
          </Row>
        </div>,
        History,
      );
    case 'events':
      return sheet(
        te('layerName'),
        <>
          <Row id="event" {...r} Icon={Flame}>
            {t('events.fire')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Waves}>
            {t('events.flood')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={CloudLightning}>
            {t('events.storm')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={MapPin} className="text-field-300">
            {t('events.report')}
          </Row>
        </>,
        Flame,
      );
    case 'farm':
      return sheet(
        t('farm.title'),
        <>
          {/* Como en la app: la recomendación primero; "Prioridades" se abre desde "Opciones". */}
          <div className="grid grid-cols-4 gap-0.5">
            {(['motor', 'conditions', 'rotations', 'plan'] as const).map((tab) => (
              <Row
                key={tab}
                id={`tab-${tab}`}
                {...r}
                className={clsx(
                  'justify-center px-0.5 text-center',
                  (sim.tab === tab || (tab === 'rotations' && sim.tab === 'priorities')) && 'bg-field-500/30 text-field-300',
                )}
              >
                {t(`farm.tabs.${tab}`)}
              </Row>
            ))}
          </div>
          {sim.tab === 'motor' && (
            <>
              <Row id="-" item={null} onTap={onTap} Icon={Check}>
                {t('farm.motor.data')}
              </Row>
              <Row id="motor-plan" {...r} Icon={Sprout}>
                {t('farm.motor.plan')}
              </Row>
              <Row id="finding" {...r} Icon={ShieldAlert}>
                {t('farm.motor.finding')} · <span className="text-ink-muted">{t('farm.rotations.confidence')}</span>
              </Row>
            </>
          )}
          {sim.tab === 'conditions' && (
            <>
              <Row id="-" item={null} onTap={onTap} Icon={Droplets}>
                {t('region.moisture')} · <b>{pct(22)}</b>
              </Row>
              <Row id="-" item={null} onTap={onTap} Icon={CloudRain}>
                {t('region.rain')} · <b>{units.rain(180)}</b>
              </Row>
            </>
          )}
          {sim.tab === 'priorities' && (
            <>
              {(['water', 'soil', 'income'] as const).map((k, i) => (
                <Row key={k} id={k} {...r}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-16 shrink-0">{t(`farm.priorities.${k}`)}</span>
                    <span className="h-1.5 flex-1 rounded-full bg-white/15">
                      <span className="block h-full rounded-full bg-field-500" style={{ width: `${[80, 60, 40][i]}%` }} />
                    </span>
                  </span>
                </Row>
              ))}
            </>
          )}
          {sim.tab === 'rotations' && (
            <>
              <Row id="edit-priorities" {...r} Icon={SlidersHorizontal}>
                {t('farm.rotations.edit')}
              </Row>
              <Row id="card" {...r} Icon={Sprout}>
                {t('farm.rotations.a')} · <span className="text-ink-muted">{t('farm.rotations.confidence')}</span>
              </Row>
              <Row id="-" item={null} onTap={onTap} Icon={Sprout}>
                {t('farm.rotations.b')} · <span className="text-ink-muted">{t('farm.rotations.risk')}</span>
              </Row>
            </>
          )}
          {sim.tab === 'plan' && (
            <>
              <Row id="-" item={null} onTap={onTap} Icon={CalendarDays}>
                {t('farm.plan.calendar')}
              </Row>
              <Row id="print" {...r} Icon={Printer}>
                {t('farm.plan.print')}
              </Row>
            </>
          )}
        </>,
        Sprout,
      );
    case 'chat':
      return sheet(
        t('chat.title'),
        <>
          <Row id="suggestion" {...r} className="ring-1 ring-sky-glow/50">
            {t('chat.question')}
          </Row>
          {sim.answered && (
            <Row id="answer" {...r} className="bg-sky-glow/10">
              {t('chat.answer')}
            </Row>
          )}
        </>,
      );
    case 'radio':
      return sheet(
        t('radio'),
        <>
          <Row id="play" {...r} Icon={Play}>
            {t('radioPanel.play')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Radio}>
            {t('radioPanel.now')}
          </Row>
        </>,
        Radio,
      );
    case 'settings':
      return sheet(
        t('settings.title'),
        <>
          <Row id="voice" {...r} Icon={Volume2}>
            {t('settings.voice')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Leaf}>
            {t('settings.lite')}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Sun}>
            {t('settings.sun')}
          </Row>
        </>,
        Settings,
      );
    case 'points':
      return sheet(
        t('points.title'),
        <>
          <Row id="-" item={null} onTap={onTap} Icon={Layers}>
            {t('points.layer', { n: pointsFor('layer') })}
          </Row>
          <Row id="-" item={null} onTap={onTap} Icon={Leaf}>
            {t('points.glossary', { n: pointsFor('glossary') })}
          </Row>
          <Row id="account" {...r} Icon={Trophy}>
            {t('points.account', { n: pointsFor('signup') })}
          </Row>
        </>,
        Trophy,
      );
    default:
      return null;
  }
}
