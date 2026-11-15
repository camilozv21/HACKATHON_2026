'use client';

import clsx from 'clsx';
import { ArrowRight, BarChart3, ChevronDown, Leaf, ListOrdered, RotateCcw, Sprout, Store, Wand2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { PrioritiesUrlSync } from '@/features/priorities/PrioritiesUrlSync';
import { DEFAULT_MARKETS, usePrioritiesStore } from '@/features/priorities/store';
import { PublishEntry } from '@/features/listings/PublishEntry';
import { SellSuggestion } from '@/features/listings/SellSuggestion';
import { MyFarmScore } from '@/features/points/MyFarmScore';
import { useSurvey } from '@/features/survey/store';
import { useTimeStore } from '@/features/time/store';
import { TimeBanner } from '@/features/time/TimeBanner';
import type { CropId } from '@/lib/api/contract';
import { useAnalysis, useClimate } from '@/lib/api/hooks';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { UrlStateProvider } from '@/lib/url/UrlStateProvider';
import { useFarmDataStore } from './farmData';
import { toSoilInfo } from './needs';
import { DataNudge, DataRequestsCard } from './panel/DataRequests';
import { buildYear } from './panel/derive';
import { RotationForm } from './panel/RotationForm';
import { SummaryCards, TerrainRisks, TrendCharts } from './panel/sections';
import { YearCalendar } from './panel/YearCalendar';
import { useFieldStore, type PanelTab } from './store';
import { toFieldInput } from './toFieldInput';

const GlossarySheet = dynamic(() => import('@/features/glossary/GlossarySheet'), { ssr: false });
const PrioritiesWizard = dynamic(() => import('@/features/priorities/PrioritiesWizard'), { ssr: false });
const RotationsView = dynamic(() => import('@/features/rotations/RotationsView'), { ssr: false });
const PastPeriodSection = dynamic(() => import('@/features/time/PastPeriodSection'), { ssr: false });
const PlanView = dynamic(() => import('@/features/rotations/mixed/PlanView'), { ssr: false });
const SurveyCard = dynamic(() => import('@/features/survey/SurveyCard'), { ssr: false });
const MotorPlan = dynamic(() => import('@/features/motor/MotorPlan'), { ssr: false });

function Section({
  title,
  icon,
  children,
  id,
  className,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  id: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={clsx('flex flex-col gap-2', className)}>
      <h3 id={id} className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="shimmer h-24 rounded-2xl" />
        ))}
      </div>
      <div className="shimmer h-48 rounded-2xl" />
      <div className="shimmer h-28 rounded-2xl" />
    </div>
  );
}

/**
 * Pestañas visibles. La primera es la recomendación del motor agronómico. "Prioridades" no tiene pestaña propia:
 * se abre desde "Opciones" (ordena esas opciones) y, mientras está abierta, "Opciones" queda marcada.
 */
const TABS: { id: PanelTab; icon: typeof Leaf }[] = [
  { id: 'motor', icon: Wand2 },
  { id: 'conditions', icon: Leaf },
  { id: 'rotations', icon: ListOrdered },
  { id: 'plan', icon: Sprout },
];
const tabOf = (tab: PanelTab): PanelTab => (tab === 'priorities' ? 'rotations' : tab);

/**
 * Análisis de la finca dentro del sheet. Clima real de NASA POWER cuando responde; el resto (verdor, hallazgos,
 * estrategias) viene del backend o de los mocks con el mismo contrato.
 */
export default function FieldPanel() {
  const t = useTranslations('panel');
  const field = useFieldStore((s) => s.field);
  const rotation = useFieldStore((s) => s.rotation);
  const tab = useFieldStore((s) => s.panelTab);
  const setTab = useFieldStore((s) => s.setPanelTab);
  const setRotation = useFieldStore((s) => s.setRotation);
  const priorities = usePrioritiesStore((s) => s.priorities);
  const timeSel = useTimeStore((s) => s.sel);
  const tablistRef = useRef<HTMLDivElement>(null);
  const lastTab = useRef(tab);

  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    const el = tablistRef.current;
    const scroller = el?.closest('.overflow-y-auto');
    if (el && scroller && el.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
      el.scrollIntoView({ block: 'start' });
    }
  }, [tab]);

  // Lo que contó el agricultor de su suelo (tarjeta "Faltan datos") también va al análisis.
  const farmSoil = useFarmDataStore((s) => (field ? s.soil[field.id] : undefined));
  // Encuesta "Cuéntanos de tu terreno" (historial y manejo): también va al análisis.
  const survey = useSurvey(field?.id);
  const soil = useMemo(() => toSoilInfo(farmSoil), [farmSoil]);
  const input = useMemo(
    () => (field ? toFieldInput(field, rotation ?? [], soil, survey) : null),
    [field, rotation, soil, survey],
  );
  const analysis = useAnalysis(input, priorities);
  const power = useClimate(field?.center[1], field?.center[0]);

  // Datos que pidió el backend para ESTA finca (mientras carga otra finca, el dato anterior no cuenta).
  const sameField = Boolean(field && analysis.data?.field.id === field.id);
  const requests = sameField ? analysis.data?.dataRequests : undefined;
  const updating = analysis.isFetching && analysis.isPlaceholderData;
  useEffect(() => {
    // El chat los usa para pedir lo que falta (view.missingData).
    if (field && sameField && !updating) useFarmDataStore.getState().setRequests(field.id, requests ?? null);
  }, [field, sameField, requests, updating]);

  const climate = power.data ?? analysis.data?.climate;
  const seasons = useMemo(() => rotation ?? analysis.data?.field.currentRotation ?? [], [rotation, analysis.data]);
  // Cultivos que ya siembra (para la encuesta y para armar mezclas desde lo conocido).
  const currentCrops = useMemo(
    () => [...new Set(seasons.filter((s) => s.role !== 'fallow' && s.role !== 'cover').map((s) => s.crop))] as CropId[],
    [seasons],
  );
  const year = useMemo(
    () => (climate ? buildYear(climate, seasons, { ndviSource: analysis.data?.climate, insights: analysis.data?.insights }) : null),
    [climate, seasons, analysis.data],
  );

  // Mercados sugeridos: cultivos de la rotación actual y de las opciones para esta zona, más ganado.
  const marketOptions = useMemo(() => {
    const crops = new Set<string>();
    for (const s of seasons) if (s.role !== 'fallow' && s.role !== 'cover') crops.add(s.crop);
    for (const st of analysis.data?.strategies ?? [])
      for (const s of st.seasons) if (s.role === 'cash' || s.role === 'perennial' || s.role === 'intercrop') crops.add(s.crop);
    crops.delete('fallow');
    crops.delete('shade-trees');
    return crops.size ? [...[...crops].slice(0, 8), 'livestock'] : [...DEFAULT_MARKETS];
  }, [seasons, analysis.data]);

  if (!field) return null;
  const loading = analysis.isPending || (power.isPending && !analysis.data);
  const source = power.data
    ? t('calendar.sourceReal', { period: power.data.baselinePeriod })
    : t('calendar.sourceAnalysis');

  return (
    <div className="flex flex-col gap-4">
      {/* Sin conexión: aviso dentro del panel (en móvil el aviso de arriba queda tapado por el sheet). */}
      <OfflineBanner />
      {/* Ancho natural de cada pestaña ("Recomendación" es la más larga); en pantallas muy angostas se desliza. */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 overflow-x-auto rounded-2xl bg-white/5 p-1 ring-1 ring-line [scrollbar-width:none]"
      >
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tabOf(tab) === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={clsx(
              // Ícono arriba y texto abajo también en escritorio: el panel lateral mide lo mismo que un teléfono.
              'flex min-h-12 flex-auto flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-xs font-semibold whitespace-nowrap',
              tabOf(tab) === id ? 'bg-field-500 text-black' : 'text-ink-muted hover:bg-white/5',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tabOf(tab)}`}
        aria-labelledby={`tab-${tabOf(tab)}`}
        aria-busy={tab === 'motor' ? undefined : loading}
      >
        {tab === 'motor' && (
          <MotorPlan
            field={field}
            seasons={rotation ?? []}
            soil={soil}
            survey={survey}
            onOpenConditions={() => setTab('conditions')}
            onOpenOptions={() => setTab('rotations')}
          />
        )}
        {tab === 'priorities' && (
          <PrioritiesWizard
            strategies={analysis.data?.strategies}
            marketOptions={marketOptions}
            onDone={() => setTab('rotations')}
          />
        )}
        {tab === 'rotations' && analysis.data && (
          <DataNudge
            fieldId={field.id}
            requests={requests}
            onComplete={() => {
              useFarmDataStore.getState().requestFocus(field.id, null);
              setTab('conditions');
            }}
          />
        )}
        {tab === 'rotations' && (
          <RotationsView
            strategies={analysis.data?.strategies}
            analysis={sameField ? analysis.data : undefined}
            fieldId={field.id}
            fieldName={field.name ?? t('unnamedField')}
            onEditPriorities={() => setTab('priorities')}
            onNext={() => setTab('plan')}
          />
        )}
        {tab === 'plan' && (
          <PlanView
            fieldId={field.id}
            climate={climate}
            climateReal={Boolean(power.data)}
            farmElevationM={power.data ? analysis.data?.climate.location.elevationM : null}
            insights={analysis.data?.insights}
            soil={soil}
            currentCrops={currentCrops}
            loading={loading}
          />
        )}
        {tab === 'conditions' &&
          (analysis.isError && !climate ? (
            <div role="alert" className="rounded-2xl bg-risk-medium/10 p-4 text-sm ring-1 ring-risk-medium/40">
              <p>{t('error')}</p>
              <button
                type="button"
                onClick={() => void analysis.refetch()}
                className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 font-semibold"
              >
                <RotateCcw aria-hidden className="size-4" />
                {t('retry')}
              </button>
            </div>
          ) : loading || !climate || !year ? (
            <>
              <p className="sr-only">{t('loading')}</p>
              <Skeleton />
            </>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Máquina del tiempo: revisar lo que pasó en una fecha pasada en esta finca. */}
              <TimeBanner />
              {timeSel && <PastPeriodSection sel={timeSel} lat={field.center[1]} lon={field.center[0]} climate={climate} />}
              {/* Cuando a los satélites no les alcanza, le preguntamos al agricultor lo que solo él sabe. */}
              {analysis.data && (
                <DataRequestsCard
                  fieldId={field.id}
                  requests={requests}
                  seasons={seasons}
                  updating={updating}
                  onConfirmRotation={(r) => setRotation(r)}
                  onEditRotation={() =>
                    document
                      .getElementById('sec-rotation')
                      ?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
                  }
                />
              )}
              <Section id="sec-summary" title={t('sections.summary')} icon={<BarChart3 aria-hidden className="size-5 text-field-300" />}>
                <SummaryCards climate={climate} insights={analysis.data?.insights} />
              </Section>
              <Section id="sec-year" title={t('sections.year')} icon={<Leaf aria-hidden className="size-5 text-field-300" />}>
                <YearCalendar year={year} source={source} />
              </Section>
              {/* Lo que siembras hoy y la encuesta: lo que los satélites no ven. Ambos mejoran el plan del motor. */}
              <Section id="sec-rotation" title={t('sections.rotation')} icon={<ListOrdered aria-hidden className="size-5 text-field-300" />}>
                <RotationForm
                  key={field.id}
                  initial={seasons}
                  usingDefault={!rotation}
                  onSave={(r) => setRotation(r)}
                />
              </Section>
              <div id="sec-survey" className="scroll-mt-4">
                <SurveyCard fieldId={field.id} suggested={currentCrops} />
              </div>
              {/* Detalle para quien quiera más: tendencias de 25 años y riesgos del terreno, cerrados de entrada. */}
              <details className="group rounded-2xl bg-white/5 ring-1 ring-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
                  <BarChart3 aria-hidden className="size-5 text-field-300" />
                  <span className="flex-1">{t('moreDetail')}</span>
                  <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-6 px-3 pb-4">
                  {/* Modo sencillo: las gráficas de tendencia (25 años) son detalle. */}
                  <Section id="sec-trends" className="lite:hidden" title={t('sections.trends')} icon={<BarChart3 aria-hidden className="size-5 text-field-300" />}>
                    <TrendCharts climate={climate} />
                  </Section>
                  {analysis.data && (
                    <Section id="sec-terrain" title={t('sections.terrain')} icon={<BarChart3 aria-hidden className="size-5 text-field-300" />}>
                      <TerrainRisks insights={analysis.data.insights} />
                    </Section>
                  )}
                </div>
              </details>
              {/* Vender y el puntaje: al final, para no tapar el análisis. */}
              <SellSuggestion field={field} survey={survey} />
              {!field.demoId && (
                <Section id="sec-share" title={t('sections.share')} icon={<Store aria-hidden className="size-5 text-field-300" />}>
                  <PublishEntry field={field} />
                  <MyFarmScore />
                </Section>
              )}
              <button
                type="button"
                onClick={() => setTab('motor')}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
              >
                {t('backToPlan')}
                <ArrowRight aria-hidden className="size-4" />
              </button>
              {analysis.data?.mock && <p className="text-xs text-ink-faint">{t('mockNote')}</p>}
            </div>
          ))}
      </div>
      <GlossarySheet />
      <UrlStateProvider>
        <PrioritiesUrlSync />
      </UrlStateProvider>
    </div>
  );
}
