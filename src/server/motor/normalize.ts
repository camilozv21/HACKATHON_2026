/**
 * Salida del motor agronómico (schema 4.x, ~150 KB) → plan resumido que ve el teléfono (`MotorPlan`, ~10 KB).
 * Defensivo: cualquier campo puede faltar o cambiar de tipo entre versiones del motor; lo que no se entiende
 * se omite (nunca se inventa). Ver docs/motor-api.md.
 */
import { CANDIDATE_STATUS, MotorPlanBase, type MotorCandidate, type MotorFinding, type MotorReason, type MotorValue } from '@/lib/api/motor';

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown) => arr(v).map(str).filter((s): s is string => s !== null);

/** Número o intervalo {min, max, text} → texto para mostrar. */
function value(v: unknown): MotorValue | null {
  const n = num(v);
  if (n !== null) return { text: String(n), min: n, max: n };
  const o = obj(v);
  const min = num(o.min);
  const max = num(o.max);
  const text = str(o.text) ?? (min !== null && max !== null ? `${min} – ${max}` : null);
  return text ? { text, min, max } : null;
}

function level(v: unknown): 'low' | 'medium' | 'high' | 'unknown' {
  const s = str(v)?.toLowerCase();
  if (s === 'high' || s === 'alta' || s === 'alto' || s === 'very_high' || s === 'critical') return 'high';
  if (s === 'medium' || s === 'moderate' || s === 'media' || s === 'medio') return 'medium';
  if (s === 'low' || s === 'baja' || s === 'bajo' || s === 'none') return 'low';
  return 'unknown';
}

function certainty(f: J): 'baja' | 'media' | 'alta' {
  const c = str(obj(f.certainty).level)?.toLowerCase();
  if (c === 'alta' || c === 'media' || c === 'baja') return c;
  // Sin bloque de certeza: la confianza de la regla, sin pasar de "media" (ninguna regla está validada por un técnico).
  const conf = level(f.confidence);
  return conf === 'low' || conf === 'unknown' ? 'baja' : 'media';
}

function sources(v: unknown) {
  return arr(v)
    .map((s) => {
      const o = obj(s);
      const title = str(o.title) ?? str(o.citation);
      return title ? { title, publisher: str(o.publisher), url: str(o.url) } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

function finding(raw: unknown): MotorFinding | null {
  const f = obj(raw);
  const id = str(f.rule_id);
  const title = str(f.title);
  if (!id || !title) return null;
  return {
    id,
    module: str(f.module) ?? 'other',
    title,
    severity: level(f.severity),
    certainty: certainty(f),
    limiting: strs(obj(f.certainty).limiting_factors),
    observation: str(f.observation) ?? '',
    recommendation: str(f.recommendation) ?? '',
    cautions: strs(f.cautions),
    why: arr(f.why)
      .map((w) => {
        const o = obj(w);
        const label = str(o.label) ?? str(o.variable);
        const observed = str(o.observed_text) ?? value(o.observed)?.text ?? null;
        if (!label || !observed) return null;
        return {
          label,
          observed,
          operator: str(o.operator),
          threshold: value(o.threshold)?.text ?? null,
          source: str(o.data_source) ?? str(o.planned_source),
          period: str(o.period),
          quality: str(o.quality_level) ?? (num(o.quality_level) != null ? String(o.quality_level) : null),
        };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null),
    sources: sources(f.external_sources),
    superseded: Boolean(str(f.superseded_by)) || arr(f.integrated_in).length > 0,
    uncalibrated: str(f.threshold_status) === 'no_calibrado_localmente',
  };
}

const EFFECTS = new Set(['block', 'discourage', 'favor', 'note']);
function reason(raw: unknown, fallback: MotorReason['effect']): MotorReason | null {
  const r = obj(raw);
  const title = str(r.title);
  const message = str(r.message);
  if (!title && !message) return null;
  const effect = str(r.effect);
  return {
    id: str(r.rule_id) ?? '',
    title: title ?? message!,
    message: message ?? '',
    effect: effect && EFFECTS.has(effect) ? (effect as MotorReason['effect']) : fallback,
    cautions: strs(r.cautions),
  };
}
const reasons = (v: unknown, fallback: MotorReason['effect']) =>
  arr(v)
    .map((r) => reason(r, fallback))
    .filter((r): r is MotorReason => r !== null);

const STATUS = new Set<string>(CANDIDATE_STATUS);
function candidate(raw: unknown): MotorCandidate | null {
  const c = obj(raw);
  const cropKey = str(c.crop_key);
  const crop = str(c.crop) ?? cropKey;
  if (!cropKey || !crop) return null;
  const status = str(c.status);
  return {
    cropKey,
    crop,
    family: str(c.family),
    status: status && STATUS.has(status) ? (status as MotorCandidate['status']) : 'sin_evaluar',
    // Primero lo que bloquea, luego lo que va en contra, lo que favorece y las notas del lote.
    reasons: [...reasons(c.blocking, 'block'), ...reasons(c.against, 'discourage'), ...reasons(c.in_favor, 'favor'), ...reasons(c.notes, 'note')],
    guidance: reasons(c.general_guidance, 'note'),
    missing: [...new Set(arr(c.unevaluated).flatMap((u) => strs(obj(u).missing)))],
  };
}

const ORDER: Record<MotorCandidate['status'], number> = { favorecido: 0, aceptable: 1, con_reservas: 2, desaconsejado: 3, sin_evaluar: 4 };
const SEVERITY: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };

/** El registro de la API puede traer la salida en `resultado` (o ser la salida misma). */
export function engineOutputOf(record: unknown): J {
  const r = obj(record);
  for (const k of ['resultado', 'result', 'salida', 'output']) {
    const inner = obj(r[k]);
    if (Object.keys(inner).length) return inner;
  }
  return r;
}

export function normalizeMotor(
  record: unknown,
  meta: { source: 'motor' | 'mock'; accepted: MotorPlanBase['accepted'] },
): MotorPlanBase {
  const rec = obj(record);
  const out = engineOutputOf(record);
  const ctx = obj(out.context);
  const territory = obj(out.territory);
  const cell = obj(territory.cell);
  const tctx = obj(territory.context);
  const inference = obj(out.inference);
  const rotation = obj(out.rotation);
  const risk = obj(out.risk_overview);

  const skipped = arr(inference.rules_skipped).map(obj);
  const wanted = new Map<string, number>();
  for (const s of skipped) {
    if (str(s.reason) !== 'missing_input') continue;
    for (const v of strs(s.missing)) wanted.set(v, (wanted.get(v) ?? 0) + 1);
  }

  const findings = arr(inference.findings)
    .map(finding)
    .filter((f): f is MotorFinding => f !== null)
    // Primero los que cuentan (no reemplazados), luego por gravedad.
    .sort((a, b) => Number(a.superseded) - Number(b.superseded) || SEVERITY[a.severity]! - SEVERITY[b.severity]!);
  const findingIds = new Set(findings.map((f) => f.id));

  const plan: MotorPlanBase = {
    source: meta.source,
    evaluationId: str(rec.id) ?? (num(rec.id) != null ? String(rec.id) : null),
    createdAt: str(rec.created_at) ?? str(out.generated_at_utc),
    engine: { schemaVersion: str(out.schema_version), notebookVersion: str(out.notebook_version) },
    accepted: meta.accepted,
    context: {
      cropKey: str(ctx.crop_key),
      crop: str(ctx.crop_or_system),
      stage: str(ctx.stage_key) === 'no_especificada' ? null : str(ctx.phenological_stage),
      altitude: value(ctx.altitude_masl),
      slope: value(ctx.slope_pct),
      thermalFloor: str(ctx.thermal_floor),
    },
    cell:
      str(cell.grid_id) || num(cell.grid_id) != null
        ? {
            gridId: String(cell.grid_id),
            lat: num(cell.latitude) ?? 0,
            lon: num(cell.longitude) ?? 0,
            areaKm2: num(cell.approx_km2),
            distanceKm: num(cell.distance_km),
          }
        : null,
    territory: Object.keys(territory).length
      ? {
          landscape: str(tctx.landscape),
          climate: str(tctx.climate_class),
          soil: str(tctx.soil_description),
          drainage: str(tctx.drainage),
          fertility: str(tctx.fertility),
          erosion: str(tctx.erosion_degree),
          ndvi: num(tctx.ndvi),
          dataAgeDays: num(tctx.data_age_days),
          notes: strs(territory.notes),
        }
      : null,
    risk: {
      overall: level(risk.overall ?? rec.riesgo_global),
      modules: Object.entries(obj(risk.by_module)).map(([module, m]) => ({
        module,
        severity: level(obj(m).severity),
        findings: Math.max(0, Math.round(num(obj(m).findings) ?? 0)),
      })),
    },
    findings,
    practices: arr(out.practices)
      .map(obj)
      .filter((p) => str(p.title) && str(p.text))
      .sort((a, b) => (num(b.relevance) ?? 0) - (num(a.relevance) ?? 0))
      .slice(0, 6)
      .map((p) => ({
        id: str(p.practice_id) ?? '',
        title: str(p.title)!,
        text: str(p.text)!,
        cautions: strs(p.cautions),
        fromFinding: arr(p.why).some((w) => str(obj(w).type) === 'finding' && strs(obj(w).ids).some((id) => findingIds.has(id))),
        sources: sources(obj(p.evidence).sources),
      })),
    rotation: {
      situation: str(rotation.situation),
      candidates: arr(rotation.candidates)
        .map(candidate)
        .filter((c): c is MotorCandidate => c !== null)
        .sort((a, b) => ORDER[a.status] - ORDER[b.status]),
      missing: arr(rotation.missing_inputs)
        .map(obj)
        .map((m) => ({ variable: str(m.variable) ?? '', label: str(m.label) ?? str(m.variable) ?? '' }))
        .filter((m) => m.label),
      verify: strs(rotation.verify_before_acting),
      cautions: strs(rotation.global_cautions),
      history: arr(obj(rotation.profile).history).map(strs).filter((c) => c.length > 0),
    },
    gaps: {
      notInBundle: strs(territory.variables_not_in_bundle),
      rulesEvaluated: num(inference.rules_evaluated),
      rulesInCatalog: num(inference.rules_in_catalog),
      skipped: {
        missingInput: skipped.filter((s) => s.reason === 'missing_input').length,
        needsSeries: skipped.filter((s) => s.reason === 'needs_series').length,
        other: skipped.filter((s) => s.reason !== 'missing_input' && s.reason !== 'needs_series').length,
      },
      wanted: [...wanted].sort((a, b) => b[1] - a[1]).map(([variable, rules]) => ({ variable, rules })),
    },
    cautions: strs(inference.global_cautions),
    agentSections: strs(obj(out.agent_instructions).recommended_response_sections),
  };
  // Si algo no cuadra con el contrato, mejor un error claro que una pantalla rota.
  return MotorPlanBase.parse(plan);
}
