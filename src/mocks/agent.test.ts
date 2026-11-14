import { describe, expect, it } from 'vitest';
import type { AgentRequest } from '@/lib/api/contract';
import { buildMockAgentResponse, detectWhen } from './agent';

const NOW = new Date('2026-11-11T12:00:00Z');

describe('agente mock: fechas pasadas', () => {
  it('reconoce meses con y sin año, "el mes pasado" y fechas ISO', () => {
    expect(detectWhen('como llovio en mayo', NOW)).toBe('2026-05');
    expect(detectWhen('lluvia en diciembre', NOW)).toBe('2025-12'); // diciembre de 2026 todavía no pasa
    expect(detectWhen('la lluvia de mayo de 2024', NOW)).toBe('2024-05');
    expect(detectWhen('rain in may 2025', NOW)).toBe('2025-05');
    expect(detectWhen('how was rain in june', NOW)).toBe('2026-06');
    expect(detectWhen('el mes pasado', NOW)).toBe('2026-10');
    expect(detectWhen('que paso el 2026-05-14', NOW)).toBe('2026-05-14');
    expect(detectWhen('may i see the rain', NOW)).toBeNull();
    expect(detectWhen('humedad del suelo en el punjab', NOW)).toBeNull();
  });

  it('una pregunta por un mes mueve la máquina del tiempo antes de activar la capa', () => {
    const req: AgentRequest = {
      sessionId: 'test-session-1',
      message: '¿Cómo estuvo la lluvia en mayo de 2025 en Iowa?',
      locale: 'es',
      userLocation: null,
      view: { center: [-74, 4.6], zoom: 3 },
      history: [],
    };
    const res = buildMockAgentResponse(req);
    const types = (res.actions as { type: string; when?: string }[]).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(['setTime', 'setLayer', 'openRegion', 'flyTo']));
    expect((res.actions as { type: string; when?: string }[]).find((a) => a.type === 'setTime')?.when).toBe('2025-05');
    expect(res.reply).toContain('mayo de 2025');
  });
});

describe('agente mock: datos que faltan', () => {
  const base: AgentRequest = {
    sessionId: 'test-session-2',
    message: '¿Qué rotación me conviene si hay sequía?',
    locale: 'es',
    userLocation: null,
    view: { center: [-75.7, 4.5], zoom: 9, fieldId: 'demo:cafe-quindio' },
    history: [],
  };

  it('antes de recomendar, pide los datos que faltan y abre las preguntas rápidas', () => {
    const res = buildMockAgentResponse({ ...base, view: { ...base.view, missingData: ['soil-type', 'irrigation'] } });
    expect(res.actions).toContainEqual({ type: 'askForData', need: 'soil-type' });
    expect(res.reply).toContain('me faltan datos');
    expect(res.reply).toContain('arenosa, franca o arcillosa');
    expect(res.reply).toContain('riego');
  });

  it('si no falta nada, abre las opciones como siempre', () => {
    const res = buildMockAgentResponse(base);
    const types = (res.actions as { type: string }[]).map((a) => a.type);
    expect(types).toContain('showStrategies');
    expect(types).not.toContain('askForData');
  });
});

describe('agente mock: eventos y emergencias', () => {
  const ask = (message: string): AgentRequest => ({
    sessionId: 'test-session-ev',
    message,
    locale: 'es',
    userLocation: null,
    view: { center: [-75.6, 4.6], zoom: 7 },
    history: [],
  });

  it('muestra los deslizamientos de un mes con la fecha puesta antes', () => {
    const res = buildMockAgentResponse(ask('¿Hubo deslizamientos en mayo de 2025?'));
    const actions = res.actions as { type: string; kind?: string; when?: string }[];
    expect(actions).toContainEqual({ type: 'setTime', when: '2025-05' });
    expect(actions).toContainEqual({ type: 'showEvents', on: true, kind: 'landslide' });
    expect(res.reply).toContain('UNGRD');
  });

  it('para reportar abre el formulario (no envía nada) y recuerda la línea de emergencias', () => {
    const res = buildMockAgentResponse(ask('Quiero reportar un derrumbe en la vía'));
    const actions = res.actions as { type: string; kind?: string }[];
    expect(actions.find((a) => a.type === 'reportEvent')?.kind).toBe('landslide');
    expect(res.reply).toContain('123');
  });

  it('la sequía sigue llevando a la rotación, no a los eventos', () => {
    const res = buildMockAgentResponse(ask('¿Qué rotación me conviene si hay sequía?'));
    expect((res.actions as { type: string }[]).some((a) => a.type === 'showEvents')).toBe(false);
  });
});

describe('agente mock: informe agroclimático', () => {
  const ask = (message: string, when?: string): AgentRequest => ({
    sessionId: 'test-session-rep',
    message,
    locale: 'es',
    userLocation: null,
    view: { center: [-75.6, 4.6], zoom: 7, when },
    history: [],
  });

  it('"genera un informe de mayo de 2025" prepara el informe de ese mes (no confunde con reportar un evento)', () => {
    const res = buildMockAgentResponse(ask('Genera un informe agroclimático de mayo de 2025 para esta zona'));
    const actions = res.actions as { type: string; when?: string }[];
    expect(actions.find((a) => a.type === 'agroReport')?.when).toBe('2025-05');
    expect(actions.some((a) => a.type === 'reportEvent' || a.type === 'showEvents')).toBe(false);
    expect(res.reply).toContain('CSV');
  });

  it('exportar los datos sin fecha usa lo que la persona ya revisa (el cliente pone la fecha)', () => {
    const res = buildMockAgentResponse(ask('Quiero exportar los datos de esta zona', '2024-03'));
    const a = (res.actions as { type: string; when?: string }[]).find((x) => x.type === 'agroReport');
    expect(a).toBeDefined();
    expect(a?.when).toBeUndefined();
  });
});
