import { beforeEach, describe, expect, it } from 'vitest';
import { toFieldInput } from '@/features/field/toFieldInput';
import { surveyAnswered } from '@/features/rotations/mixed/planner';
import { FieldInput } from '@/lib/api/contract';
import { EMPTY_SURVEY, SURVEY_STEPS, useSurveyStore } from './store';

const field = {
  id: 'pt:-75.77,4.53',
  name: null,
  geometry: { type: 'Point' as const, coordinates: [-75.77, 4.53] as [number, number] },
  areaHa: null,
  center: [-75.77, 4.53] as [number, number],
  source: 'pin' as const,
};

describe('encuesta del terreno', () => {
  beforeEach(() => {
    useSurveyStore.setState({ byField: {}, draft: null });
    window.localStorage.clear();
  });

  it('las respuestas quedan en borrador hasta guardar, y se recuerdan por finca', () => {
    const s = useSurveyStore.getState();
    s.start(field.id);
    s.answer({ usualCrops: ['maize', 'beans'], lastCrop: 'maize' });
    expect(useSurveyStore.getState().byField[field.id]).toBeUndefined();
    s.setStep(99);
    expect(useSurveyStore.getState().draft?.step).toBe(SURVEY_STEPS.length - 1);
    s.answer({ fertilization: 'none', pests: [] });
    s.finish();
    const saved = useSurveyStore.getState().byField[field.id]!;
    expect(saved).toEqual({ ...EMPTY_SURVEY, usualCrops: ['maize', 'beans'], lastCrop: 'maize', fertilization: 'none', pests: [] });
    expect(useSurveyStore.getState().draft).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('fieldshift:survey:v1')!)[field.id].lastCrop).toBe('maize');
    // "Ninguno" (pests = []) cuenta como respuesta; sin responder es null.
    expect(surveyAnswered(saved)).toBe(4);
  });

  it('al reabrir arranca con lo que ya respondió', () => {
    useSurveyStore.setState({ byField: { [field.id]: { ...EMPTY_SURVEY, purpose: 'home' } } });
    useSurveyStore.getState().start(field.id, 2);
    expect(useSurveyStore.getState().draft).toMatchObject({ step: 2, answers: { purpose: 'home' } });
  });

  it('la encuesta viaja al backend dentro de la finca y cumple el contrato', () => {
    const survey = { ...EMPTY_SURVEY, usualCrops: ['cassava' as const], residues: 'burn' as const };
    const input = toFieldInput(field, [], undefined, survey);
    expect(input.survey).toEqual(survey);
    expect(FieldInput.safeParse(input).success).toBe(true);
    expect('survey' in toFieldInput(field, [], undefined, null)).toBe(false);
  });
});
