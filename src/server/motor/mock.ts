/**
 * Motor de ejemplo mientras la API del equipo no está desplegada (sin MOTOR_API_URL, o MOTOR_FORCE_MOCK=true).
 * Parte de una salida real del motor 4.1.0 (Antioquia, fríjol en floración, `src/mocks/motor/sample.json`) y la
 * ajusta a lo que se pidió: cultivo, etapa, historial. La UI avisa que es un ejemplo.
 */
import type { MotorPlanRequest } from '@/lib/api/motor';
import sample from '@/mocks/motor/sample.json';
import { clientRef } from './client';

const CROP_LABEL: Record<string, string> = {
  maiz: 'Maíz',
  frijol: 'Fríjol común',
  calabaza: 'Calabaza / ahuyama',
  caupi: 'Fríjol caupí',
  platano: 'Plátano',
  cana_panelera: 'Caña panelera',
  tres_hermanas: 'Sistema Tres Hermanas (maíz + fríjol + calabaza)',
  otro: 'Otro / no especificado',
};
const STAGE_LABEL: Record<string, string> = {
  establecimiento: 'Establecimiento / emergencia',
  vegetativo: 'Crecimiento vegetativo',
  floracion: 'Floración',
  fructificacion: 'Formación de frutos / vainas',
  llenado: 'Llenado',
  maduracion: 'Maduración',
};

type J = Record<string, unknown>;

export function mockEvaluation(req: MotorPlanRequest): unknown {
  const out = structuredClone(sample) as unknown as J;
  const crop = req.crop ?? 'otro';
  out.context = {
    ...(out.context as J),
    crop_key: crop,
    crop_or_system: CROP_LABEL[crop],
    stage_key: req.stage ?? 'no_especificada',
    phenological_stage: req.stage ? STAGE_LABEL[req.stage] : 'No especificada',
  };
  const territory = out.territory as J;
  const cell = territory.cell as J;
  cell.requested = { latitude: req.zone.center[1], longitude: req.zone.center[0] };

  // Los hallazgos de un cultivo (p. ej. fríjol) solo aplican si ese es el cultivo pedido.
  const inference = out.inference as J;
  const findings = (inference.findings as J[]).filter((f) => {
    const crops = ((f.applies_to as J | undefined)?.crops as string[] | undefined) ?? [];
    return crops.length === 0 || crops.includes(crop);
  });
  inference.findings = findings;
  inference.findings_count = findings.length;

  // Sin historial el motor no evalúa la rotación: todos quedan "sin evaluar".
  const rotation = out.rotation as J;
  rotation.profile = { ...(rotation.profile as J), history: req.history, residue_management: req.residue };
  if (!req.history.length) {
    rotation.situation = 'sin_historial';
    rotation.candidates = (rotation.candidates as J[]).map((c) => ({ ...c, status: 'sin_evaluar', blocking: [], against: [], in_favor: [] }));
  }

  return {
    id: `mock-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
    referencia_cliente: clientRef(req.fieldId),
    grid_id: cell.grid_id,
    riesgo_global: (out.risk_overview as J).overall,
    resultado: out,
  };
}
