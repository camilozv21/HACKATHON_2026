import { beforeEach, describe, expect, it } from 'vitest';
import { MODE_KEY, NARRATOR_KEY, ONBOARDED_KEY, usePrefsStore } from '@/lib/prefs';
import { agentProfile, useProfileStore } from './profile';

describe('perfil y preferencias de inicio', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.mode;
    useProfileStore.setState({ profile: null });
    usePrefsStore.setState({ mode: 'full', narrator: false, onboarded: false });
  });

  it('el modo sencillo se guarda y se aplica en <html data-mode>', () => {
    usePrefsStore.getState().setMode('lite');
    expect(window.localStorage.getItem(MODE_KEY)).toBe('lite');
    expect(document.documentElement.dataset.mode).toBe('lite');
    usePrefsStore.getState().setMode('full');
    expect(document.documentElement.dataset.mode).toBeUndefined();
  });

  it('reload() recoge lo que escribió la bienvenida en línea (voz e introducción vista)', () => {
    window.localStorage.setItem(NARRATOR_KEY, '1');
    window.localStorage.setItem(ONBOARDED_KEY, '1');
    usePrefsStore.getState().reload();
    expect(usePrefsStore.getState().narrator).toBe(true);
    expect(usePrefsStore.getState().onboarded).toBe(true);
  });

  it('el perfil se recuerda y el agente recibe rol, modo y voz', () => {
    expect(agentProfile()).toEqual({ mode: 'full', narrator: false });
    useProfileStore.getState().setProfile({
      role: 'farmer',
      goal: 'climate',
      reading: 'listen',
      suggestions: ['¿Cómo está la lluvia en mi zona?'],
      source: 'rules',
    });
    usePrefsStore.getState().setMode('lite');
    usePrefsStore.getState().setNarrator(true);
    expect(JSON.parse(window.localStorage.getItem('fieldshift:profile:v1')!).role).toBe('farmer');
    expect(agentProfile()).toEqual({ role: 'farmer', mode: 'lite', narrator: true });
    useProfileStore.getState().setProfile(null);
    expect(window.localStorage.getItem('fieldshift:profile:v1')).toBeNull();
  });
});
