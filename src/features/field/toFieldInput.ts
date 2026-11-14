import type { CropSeason, FieldInput, FieldSurvey, SoilInfo } from '@/lib/api/contract';
import type { SelectedField } from './types';

/** Convierte la finca seleccionada (y lo que contó el agricultor) en la entrada del contrato de la API. */
export function toFieldInput(
  field: SelectedField,
  currentRotation: CropSeason[] = [],
  soil?: SoilInfo,
  survey?: FieldSurvey | null,
): FieldInput {
  return {
    id: field.id,
    name: field.name,
    geometry: field.geometry,
    areaHa: field.areaHa && field.areaHa > 0 ? Math.round(field.areaHa * 100) / 100 : null,
    currentRotation,
    ...(soil && { soil }),
    ...(survey && { survey }),
    demoId: field.demoId,
  };
}
