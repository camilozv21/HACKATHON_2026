/**
 * Mock de POST /rotations/outlook con el mismo contrato que el backend (src/lib/api/outlook.ts).
 * El modelo está en model.ts, el calendario social en calendar.ts y las fuentes en references.ts.
 */
import type { OutlookRequestParsed, OutlookResponse } from '@/lib/api/outlook';
import { strategyOutlooks, TOLERABLE_T_HA, DAYS_PER_WORKER, tr, type Loc } from './model';
import { referencesFor, type RefId } from './references';

export type RegionHint = { region: 'co' | 'global'; placeName: string | null };

function contextFor(hint: RegionHint, l: Loc): OutlookResponse['context'] {
  const facts: OutlookResponse['context']['facts'] = [];
  if (hint.region === 'co') {
    facts.push(
      {
        id: 'co-smallholders',
        text: tr(
          l,
          'En Colombia, el 70,4 % de las unidades productivas tiene menos de 5 hectáreas y ocupa solo el 2,0 % del área rural censada.',
          'In Colombia, 70.4% of farm units are under 5 hectares and occupy only 2.0% of the surveyed rural area.',
        ),
        refIds: ['dane-cna-2014'] satisfies RefId[],
      },
      {
        id: 'co-ageing',
        text: tr(
          l,
          'El campo envejece: en 2014 había 52 personas de 60 años o más por cada 100 menores de 15 (en 2005, 27). Saber quién va a trabajar es parte de la decisión.',
          'The countryside is ageing: in 2014 there were 52 people aged 60+ for every 100 under 15 (in 2005, 27). Knowing who will do the work is part of the decision.',
        ),
        refIds: ['dane-cna-2014-envejecimiento'] satisfies RefId[],
      },
      {
        id: 'co-acfc',
        text: tr(
          l,
          'La agricultura campesina, familiar y comunitaria tiene lineamientos de política propios (Resolución 464 de 2017). Recuerdan que solo el 16,5 % de las fincas tuvo asistencia técnica en 2014: pregunta en tu municipio qué apoyo hay.',
          'Peasant, family and community farming has its own policy guidelines (Resolution 464 of 2017). They note that only 16.5% of farms had technical assistance in 2014: ask your municipality what support exists.',
        ),
        refIds: ['minagricultura-464-2017'] satisfies RefId[],
      },
    );
  }
  facts.push({
    id: 'small-farms',
    text: tr(
      l,
      'En el mundo, el 84 % de las fincas tiene menos de 2 hectáreas. Trabajan una parte pequeña de la tierra, pero producen cerca de un tercio de la comida (30–35 % según el estudio): lo que decides en tu lote cuenta.',
      'Worldwide, 84% of farms are under 2 hectares. They work a small share of the land but produce about a third of the food (30–35% depending on the study): what you decide on your plot counts.',
    ),
    refIds: ['lowder-2021', 'ricciardi-2018'] satisfies RefId[],
  });
  return {
    region: hint.region,
    placeName: hint.placeName,
    facts,
    questions: [
      tr(
        l,
        '¿Quién trabaja la finca y en qué meses hay más trabajo?',
        'Who works the farm and in which months is there most work?',
      ),
      tr(
        l,
        '¿La tierra es propia, arrendada o en compañía? ¿Por cuántos años?',
        'Is the land owned, rented or sharecropped? For how many years?',
      ),
      tr(
        l,
        '¿A quién le vendes y en qué meses necesitas dinero?',
        'Who do you sell to and in which months do you need money?',
      ),
      tr(
        l,
        '¿Qué comida sale de la finca para la casa y en qué meses falta?',
        'What food goes from the farm to the home, and in which months is it missing?',
      ),
    ],
  };
}

export function buildMockOutlook(req: OutlookRequestParsed, hint: RegionHint): OutlookResponse {
  const l: Loc = req.locale;
  const { outlooks, ctx } = strategyOutlooks(req, l, hint.region === 'co');
  const hh = req.household;

  const assumptions: string[] = [];
  if (req.field.soil?.organicMatterPct == null) {
    assumptions.push(
      tr(
        l,
        `No tenemos tu análisis de suelo: partimos de ${ctx.som0} % de materia orgánica, lo típico para este clima.`,
        `We don't have your soil test: we start from ${ctx.som0}% organic matter, typical for this climate.`,
      ),
    );
  }
  if (req.field.areaHa == null) {
    assumptions.push(
      tr(
        l,
        'No sabemos el tamaño del lote: hicimos las cuentas para 1 hectárea.',
        "We don't know the plot size: we calculated for 1 hectare.",
      ),
    );
  }
  if (hh?.workers == null) {
    assumptions.push(
      tr(
        l,
        `Supusimos 2 personas de la familia con ${DAYS_PER_WORKER} jornales al mes cada una (un empleo agrícola de tiempo completo).`,
        `We assumed 2 family members giving ${DAYS_PER_WORKER} workdays a month each (one full-time farm job).`,
      ),
    );
  }
  if (req.site?.slopePct == null) {
    assumptions.push(
      tr(
        l,
        'No medimos la pendiente de tu lote: el suelo que se lava es una estimación gruesa.',
        "We didn't measure your plot's slope: soil loss is a rough estimate.",
      ),
    );
  }
  // En Colombia, el puntaje de ingresos del análisis ya usa precios mayoristas (SIPSA) y rendimientos del departamento
  // (EVA): ver docs/market-data.md. En otros países sigue siendo un valor relativo genérico.
  const colombia = hint.region === 'co';
  assumptions.push(
    colombia
      ? tr(
          l,
          'Los jornales son valores típicos de referencia. Los ingresos usan precios mayoristas de DANE SIPSA y rendimientos de tu departamento, no lo que te pagan en finca ni tus costos: compáralos con tus cuentas.',
          'Workdays are typical reference values. Income uses DANE SIPSA wholesale prices and your department’s yields, not your farm-gate price or your costs: compare them with your own numbers.',
        )
      : tr(
          l,
          'Los jornales son valores típicos de referencia y los ingresos no usan precios de tu mercado: compáralos con tus cuentas.',
          'Workdays are typical reference values and income does not use your local prices: compare them with your own numbers.',
        ),
    tr(
      l,
      'El clima se supone como el promedio de los últimos 20 años: no incluye un El Niño o una La Niña fuerte. El rango muestra años buenos y malos típicos.',
      'Climate is assumed to be the 20-year average: it does not include a strong El Niño or La Niña. The range shows typical good and bad years.',
    ),
  );

  const context = contextFor(hint, l);
  const cited = new Set<string>([
    ...outlooks.flatMap((o) => [
      ...o.milestones.flatMap((m) => m.refIds),
      ...o.social.flatMap((f) => f.refIds),
    ]),
    ...context.facts.flatMap((f) => f.refIds),
    // El modelo mismo: efecto rotación, materia orgánica, erosión, bache de la transición.
    ...([
      'zhao-2022',
      'poeplau-don-2015',
      'bakker-2004',
      'den-biggelaar-2004',
      'verheijen-2009',
      'sare-2019',
      'gaudin-2015',
      'dane-2011-jornales',
    ] satisfies RefId[]),
  ]);

  return {
    fieldId: req.field.id,
    horizonYears: req.horizonYears,
    pace: req.pace,
    baseline: {
      soilOrganicMatterPct: ctx.som0,
      soilOrganicMatterSource: req.field.soil?.organicMatterPct != null ? 'Dato local' : 'Modelo agronómico',
      bareSoilLossTHa: Math.round(ctx.bare),
      tolerableSoilLossTHa: TOLERABLE_T_HA,
      areaHa: ctx.area,
      areaAssumed: req.field.areaHa == null,
      workers: ctx.workers,
      workersAssumed: hh?.workers == null,
      laborDaysHa: Math.round(
        outlooks.find((o) => o.strategyId === ctx.current.id)!.labor.perHaByMonth.reduce((a, b) => a + b, 0),
      ),
    },
    strategies: outlooks,
    context,
    assumptions,
    references: referencesFor([...cited], l),
    generatedAt: new Date().toISOString(),
    disclaimer: tr(
      l,
      'Es una proyección con reglas simples y promedios, no un pronóstico. Úsala para conversar en familia y con un técnico de tu zona.',
      'This is a projection with simple rules and averages, not a forecast. Use it to talk it over as a family and with a local extension agent.',
    ),
    mock: true,
  };
}
