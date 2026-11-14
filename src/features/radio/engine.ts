/**
 * Motor de la radio: un solo HTMLAudioElement global + Web Audio (visualizador, estática, ducking).
 * Reglas del navegador: nunca autoplay al cargar; el primer play exige un toque (activate()).
 * Si un mp3 no existe todavía, se lee el guion con la voz del navegador (speechSynthesis) y se avisa en la UI.
 */
import { useNarratorStore } from '@/features/narrator/store';
import { currentSegment, currentStation, useRadioStore } from './store';

class RadioEngine {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private levels = new Uint8Array(16);
  private voiceActive = false;
  private ducked = false;
  private preloader: HTMLAudioElement | null = null;

  private el() {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('ended', () => this.next());
      a.addEventListener('error', () => this.onAudioError());
      this.audio = a;
    }
    return this.audio;
  }

  /** Se llama dentro del primer gesto de la persona (requisito de autoplay). */
  activate() {
    useRadioStore.getState().setActivated();
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(this.el());
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(gain).connect(analyser).connect(ctx.destination);
      this.ctx = ctx;
      this.gain = gain;
      this.analyser = analyser;
      this.levels = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Sin Web Audio: el audio suena igual, solo sin visualizador ni estática.
    }
  }

  isPlaying() {
    const st = useRadioStore.getState().status;
    return st === 'playing' || st === 'static' || st === 'loading';
  }

  async play() {
    const seg = currentSegment();
    if (!seg) {
      useRadioStore.getState().setStatus('empty');
      return;
    }
    this.stopVoice();
    const a = this.el();
    useRadioStore.getState().setUsingVoice(false);
    useRadioStore.getState().setStatus('loading');
    if (!a.src.endsWith(seg.audioUrl)) a.src = seg.audioUrl;
    a.volume = this.ducked ? 0.25 : 1;
    try {
      await a.play();
      useRadioStore.getState().setStatus('playing');
      this.updateMediaSession();
      this.preloadNext();
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') useRadioStore.getState().setStatus('paused');
      // NotSupportedError / 404 llegan también por el evento 'error' → onAudioError
    }
  }

  pause() {
    this.audio?.pause();
    this.stopVoice();
    useRadioStore.getState().setStatus('paused');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  toggle() {
    if (this.isPlaying()) this.pause();
    else {
      this.activate();
      void this.play();
    }
  }

  next() {
    const s = useRadioStore.getState();
    if (!s.segments.length) return;
    s.setIndex((s.index + 1) % s.segments.length);
    if (s.status !== 'paused' && s.status !== 'idle') void this.play();
  }

  previous() {
    const s = useRadioStore.getState();
    if (!s.segments.length) return;
    s.setIndex((s.index - 1 + s.segments.length) % s.segments.length);
    void this.play();
  }

  /** El mp3 no cargó: voz del navegador si existe; si no, siguiente segmento (o estado vacío). */
  private onAudioError() {
    const seg = currentSegment();
    if (!seg || !this.isPlaying()) return;
    if ('speechSynthesis' in window) {
      this.speak(seg.transcript, currentStation()?.language ?? 'es');
      return;
    }
    const s = useRadioStore.getState();
    if (s.segments.length > 1 && s.index < s.segments.length - 1) this.next();
    else s.setStatus('empty');
  }

  private speak(text: string, lang: string) {
    // El locutor de la app usa la misma voz del navegador: si está leyendo, la radio espera en pausa (no lo corta).
    if (useNarratorStore.getState().speakingId) {
      this.pause();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'es-ES';
    u.rate = 1;
    u.volume = this.ducked ? 0.3 : 1;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
    if (voice) u.voice = voice;
    u.onend = () => {
      if (!this.voiceActive) return;
      this.voiceActive = false;
      this.next();
    };
    u.onerror = () => {
      // Tras pause()/play() (cancel propio) el error "interrupted" llega tarde: no debe dejar la radio en "vacía".
      if (!this.voiceActive) return;
      this.voiceActive = false;
      useRadioStore.getState().setStatus('empty');
    };
    speechSynthesis.cancel();
    this.voiceActive = true;
    speechSynthesis.speak(u);
    useRadioStore.getState().setUsingVoice(true);
    useRadioStore.getState().setStatus('playing');
    this.updateMediaSession();
  }

  private stopVoice() {
    if (this.voiceActive && 'speechSynthesis' in window) {
      this.voiceActive = false;
      speechSynthesis.cancel();
    }
  }

  private preloadNext() {
    const s = useRadioStore.getState();
    const nextSeg = s.segments[(s.index + 1) % s.segments.length];
    if (!nextSeg || nextSeg.audioUrl === currentSegment()?.audioUrl) return;
    this.preloader ??= new Audio();
    this.preloader.preload = 'auto';
    this.preloader.src = nextSeg.audioUrl;
  }

  /** Breve estática (ruido blanco filtrado, ~0.45 s) al cambiar de emisora. Generada, no es un archivo. */
  staticBurst(ms = 450): Promise<void> {
    if (!this.ctx || this.ctx.state !== 'running') return Promise.resolve();
    const ctx = this.ctx;
    const len = Math.floor((ctx.sampleRate * ms) / 1000);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(this.ducked ? 0.08 : 0.3, ctx.currentTime + 0.04);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + ms / 1000);
    src.connect(filter).connect(env).connect(ctx.destination);
    useRadioStore.getState().setStatus('static');
    src.start();
    return new Promise((resolve) => {
      src.onended = () => resolve();
    });
  }

  /** Baja el volumen mientras el asistente responde o la persona dicta por voz. */
  duck(on: boolean) {
    this.ducked = on;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(on ? 0.25 : 1, this.ctx.currentTime, 0.15);
    else if (this.audio) this.audio.volume = on ? 0.25 : 1;
  }

  /** Niveles 0–255 para el visualizador (sintéticos si suena la voz del navegador). */
  getLevels(): Uint8Array {
    if (this.voiceActive) {
      const t = performance.now() / 180;
      for (let i = 0; i < this.levels.length; i++) {
        this.levels[i] = Math.max(0, Math.min(255, 120 + 90 * Math.sin(t + i * 0.9) * Math.sin(t * 0.37 + i)));
      }
      return this.levels;
    }
    if (this.analyser) this.analyser.getByteFrequencyData(this.levels as Uint8Array<ArrayBuffer>);
    return this.levels;
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const seg = currentSegment();
    const station = currentStation();
    if (!seg || !station) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: seg.title,
      artist: `${station.name} · ${station.frequencyLabel}`,
      album: 'Radio del campo · Field Shift',
      artwork: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('play', () => this.toggle());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
  }

  dispose() {
    this.pause();
    if (this.audio) this.audio.src = '';
  }
}

export const radioEngine = new RadioEngine();
