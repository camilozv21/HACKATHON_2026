/**
 * Motor de la radio: un solo HTMLAudioElement global + Web Audio (visualizador, estática, ducking).
 * Reglas del navegador: nunca autoplay al cargar; el primer play exige un toque (activate()).
 *
 * - Los guiones sin mp3 (el programa del día) se leen con la voz del teléfono frase por frase: subtítulos en vivo,
 *   pistas sobre el globo en su frase y, al pausar, se retoma desde la frase en que iba.
 * - En un mp3, la frase que suena se estima repartiendo la duración según el largo de cada frase.
 * - Si un mp3 no carga, se lee su guion con la voz del teléfono y se avisa en la UI.
 * - Al empezar una emisora, la radio se identifica en voz ("Estás en Radio Campo…") mientras llega el programa;
 *   esa primera frase va dentro del toque, como piden los navegadores para hablar.
 */
// Desde narrator (no voices): ese módulo pide las voces al cargar, y Chrome las entrega tarde.
import { pickVoice, speakable } from '@/features/narrator/narrator';
import { useNarratorStore } from '@/features/narrator/store';
import type { RadioSegment } from '@/lib/api/contract';
import { env } from '@/lib/env';
import { runCues } from './cues';
import { useRadioLive } from './live';
import { sentenceAt, sentenceStarts, speechSeconds, splitSentences } from './sentences';
import { currentSegment, currentStation, useRadioStore } from './store';

type Hooks = {
  /** Pide el programa de la emisora; null si no hay nada que esperar. */
  beforePlay?: () => Promise<void> | null;
  /** Frase de identificación de la emisora sintonizada. */
  ident?: () => string | null;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Lo máximo que se espera al programa antes de seguir con los segmentos grabados (el servidor corta sus fuentes a 6 s). */
const PROGRAM_WAIT_MS = 9000;

class RadioEngine {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private levels = new Uint8Array(16);
  private ducked = false;
  private preloader: HTMLAudioElement | null = null;
  private hooks: Hooks = {};

  /** La voz del teléfono está leyendo el guion de un segmento. */
  private voiceActive = false;
  /** La voz está diciendo la identificación de la emisora (no es un segmento: el programa entra delante). */
  private identActive = false;
  /** Invalida los callbacks de las frases anteriores al pausar, saltar o cambiar de segmento. */
  private voiceToken = 0;
  /** Referencia viva a la frase en curso (Chrome a veces suelta la utterance y nunca llega su `end`). */
  private utterance: SpeechSynthesisUtterance | null = null;
  private startToken = 0;
  /** Emisora que ya empezó a sonar (para no repetir la identificación al reanudar). */
  private startedStation: string | null = null;
  /** Segmentos cuyo mp3 no cargó: se leen con la voz. */
  private noAudio = new Set<string>();

  private prepared: RadioSegment | null = null;
  private sentences: string[] = [];
  private starts: number[] = [];
  private startsDur = 0;

  setHooks(hooks: Hooks) {
    this.hooks = hooks;
  }

  /** Nueva sintonía (aunque sea una emisora ya escuchada): el próximo play la empieza de cero. */
  resetStation() {
    this.startToken++;
    this.startedStation = null;
  }

  private el() {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('ended', () => this.next());
      a.addEventListener('error', () => this.onAudioError());
      a.addEventListener('timeupdate', () => this.onTime());
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

  /** Ya suena un segmento (audio o guion leído), no solo "cargando" o la identificación. */
  isSounding() {
    return this.voiceActive || Boolean(this.audio && !this.audio.paused);
  }

  /** El segmento se lee con la voz del teléfono (sin mp3, o su mp3 no cargó). */
  isVoiceSegment(seg: RadioSegment | null) {
    return Boolean(seg && (!seg.audioUrl || this.noAudio.has(seg.id)));
  }

  private prepare(seg: RadioSegment) {
    if (this.prepared === seg) return;
    this.prepared = seg;
    this.sentences = splitSentences(seg.transcript);
    this.starts = sentenceStarts(this.sentences, seg.durationSec);
    this.startsDur = seg.durationSec;
  }

  private onSentence(i: number) {
    const seg = currentSegment();
    if (!seg) return;
    if (useRadioLive.getState().sentence !== i) useRadioLive.getState().setSentence(i);
    runCues(seg, i);
  }

  private onTime() {
    const a = this.audio;
    const seg = currentSegment();
    if (!a || !seg || a.paused || this.voiceActive || this.prepared !== seg) return;
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : seg.durationSec;
    if (dur !== this.startsDur) {
      this.starts = sentenceStarts(this.sentences, dur);
      this.startsDur = dur;
    }
    this.onSentence(sentenceAt(this.starts, a.currentTime));
  }

  async play(opts: { sentence?: number } = {}) {
    const seg = currentSegment();
    const store = useRadioStore.getState();
    if (!seg) {
      store.setStatus('empty');
      return;
    }
    this.stopVoice();
    this.prepare(seg);
    this.startedStation = store.tunedId;
    const from = Math.max(0, Math.min(opts.sentence ?? 0, Math.max(0, this.sentences.length - 1)));
    if (this.isVoiceSegment(seg)) {
      this.audio?.pause();
      this.speakFrom(from);
      return;
    }
    const a = this.el();
    store.setUsingVoice(false);
    store.setStatus('loading');
    const url = seg.audioUrl!;
    const changed = !a.src.endsWith(url);
    if (changed) a.src = url;
    if (opts.sentence != null) {
      const at = this.starts[from] ?? 0;
      if (changed) a.addEventListener('loadedmetadata', () => (a.currentTime = at), { once: true });
      else a.currentTime = at;
    } else if (changed) {
      useRadioLive.getState().setSentence(0);
    }
    a.volume = this.ducked ? 0.25 : 1;
    // El mp3 pasa por Web Audio: si el contexto quedó suspendido (iOS al bloquear la pantalla, una llamada…), el
    // audio "suena" en silencio. Se reanuda antes de cada play.
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    try {
      await a.play();
      useRadioStore.getState().setStatus('playing');
      this.updateMediaSession();
      this.preloadNext();
      this.onSentence(from);
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') useRadioStore.getState().setStatus('paused');
      // NotSupportedError / 404 llegan también por el evento 'error' → onAudioError
    }
  }

  pause() {
    this.startToken++;
    this.audio?.pause();
    this.stopVoice();
    useRadioStore.getState().setStatus('paused');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  /** Botón de play/pausa: la primera vez en una emisora se identifica y espera al programa; después, retoma. */
  toggle() {
    if (this.isPlaying()) {
      this.pause();
      return;
    }
    this.activate();
    if (this.startedStation !== useRadioStore.getState().tunedId) {
      this.startStation();
      return;
    }
    const seg = currentSegment();
    void this.play(this.isVoiceSegment(seg) ? { sentence: useRadioLive.getState().sentence } : {});
  }

  /** Empieza la emisora sintonizada: identificación en voz + programa del día (si hay que esperarlo). */
  startStation() {
    const before = this.hooks.beforePlay?.() ?? null;
    const ident = useNarratorStore.getState().speakingId ? null : (this.hooks.ident?.() ?? null);
    if (!before && !ident) {
      void this.play();
      return;
    }
    const token = ++this.startToken;
    this.startedStation = useRadioStore.getState().tunedId;
    useRadioStore.getState().setStatus('loading');
    const spoken = ident ? this.sayOnce(ident) : Promise.resolve();
    const waited = before ? Promise.race([before.catch(() => undefined), sleep(PROGRAM_WAIT_MS)]) : Promise.resolve();
    void Promise.all([spoken, waited]).then(() => {
      if (token !== this.startToken) return;
      // El programa pudo entrar en la cola delante: se empieza por donde quedó el índice.
      void this.play();
    });
  }

  /** Salta a una frase del segmento actual (toque en la transcripción). */
  seekSentence(i: number) {
    this.activate();
    this.startedStation = useRadioStore.getState().tunedId;
    void this.play({ sentence: i });
  }

  /** Salta a un segmento de la cola. */
  playAt(i: number) {
    const s = useRadioStore.getState();
    if (!s.segments[i]) return;
    s.setIndex(i);
    useRadioLive.getState().setSentence(0);
    this.activate();
    this.startedStation = s.tunedId;
    void this.play();
  }

  next() {
    const s = useRadioStore.getState();
    if (!s.segments.length) return;
    s.setIndex((s.index + 1) % s.segments.length);
    useRadioLive.getState().setSentence(0);
    if (s.status !== 'paused' && s.status !== 'idle') void this.play();
  }

  previous() {
    const s = useRadioStore.getState();
    if (!s.segments.length) return;
    s.setIndex((s.index - 1 + s.segments.length) % s.segments.length);
    useRadioLive.getState().setSentence(0);
    void this.play();
  }

  /**
   * El mp3 no cargó: voz del navegador si existe; si no (o con solo audios grabados), siguiente segmento o estado
   * vacío.
   */
  private onAudioError() {
    const seg = currentSegment();
    if (!seg || !this.isPlaying()) return;
    this.noAudio.add(seg.id);
    if ('speechSynthesis' in window && !env.radioAudioOnly) {
      this.speakFrom(useRadioLive.getState().sentence);
      return;
    }
    const s = useRadioStore.getState();
    if (s.segments.length > 1 && s.index < s.segments.length - 1) this.next();
    else s.setStatus('empty');
  }

  private lang(seg: RadioSegment | null): 'es' | 'en' {
    const l = seg?.language ?? currentStation()?.language ?? document.documentElement.lang ?? 'es';
    return l.startsWith('en') ? 'en' : 'es';
  }

  private utter(text: string, lang: 'es' | 'en') {
    const u = new SpeechSynthesisUtterance(speakable(text, lang));
    const voice = pickVoice(speechSynthesis.getVoices(), lang);
    u.lang = voice?.lang ?? (lang === 'en' ? 'en-US' : 'es-ES');
    if (voice) u.voice = voice;
    u.rate = document.documentElement.dataset.mode === 'lite' ? 0.92 : 1;
    u.volume = this.ducked ? 0.3 : 1;
    this.utterance = u;
    return u;
  }

  /** Lee el guion del segmento actual desde la frase `from`, una frase por utterance. */
  private speakFrom(from: number) {
    const seg = currentSegment();
    if (!seg) return;
    // El locutor de la app usa la misma voz: si está leyendo, la radio espera en pausa (no lo corta).
    if (useNarratorStore.getState().speakingId) {
      this.pause();
      return;
    }
    if (!('speechSynthesis' in window)) {
      useRadioStore.getState().setStatus('empty');
      return;
    }
    const lang = this.lang(seg);
    const token = ++this.voiceToken;
    const say = (k: number) => {
      if (token !== this.voiceToken) return;
      if (k >= this.sentences.length) {
        this.voiceActive = false;
        this.next();
        return;
      }
      const text = this.sentences[k]!;
      const u = this.utter(text, lang);
      let settled = false;
      let guard: ReturnType<typeof setTimeout> | undefined;
      const advance = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        say(k + 1);
      };
      u.onstart = () => token === this.voiceToken && this.onSentence(k);
      u.onend = advance;
      u.onerror = (e) => {
        // Los cortes propios (pausa, salto) ya cambiaron el token; un "interrupted" de otro lado lo resuelve el
        // vigilante (sigue con la frase siguiente en vez de dejar la radio muda).
        if (token !== this.voiceToken || e.error === 'interrupted' || e.error === 'canceled') return;
        settled = true;
        clearTimeout(guard);
        this.voiceActive = false;
        useRadioStore.getState().setStatus('empty');
      };
      // Vigilante: Chrome y Android a veces sueltan una frase sin avisar (nunca llega su `end`) y la radio quedaba
      // muda con el botón en "pausa". Pasado el doble de lo que dura la frase, si la voz ya no habla, sigue.
      const check = () => {
        if (settled || token !== this.voiceToken) return;
        if (speechSynthesis.speaking || speechSynthesis.pending) guard = setTimeout(check, 2000);
        else advance();
      };
      guard = setTimeout(check, speechSeconds(text, u.rate) * 2000 + 3000);
      speechSynthesis.speak(u);
    };
    const wasBusy = speechSynthesis.speaking || speechSynthesis.pending;
    if (wasBusy) speechSynthesis.cancel();
    this.voiceActive = true;
    useRadioStore.getState().setUsingVoice(true);
    useRadioStore.getState().setStatus('playing');
    this.updateMediaSession();
    this.onSentence(from);
    // Algunos Chrome ignoran un speak() justo después de cancel(): una pausa corta lo evita.
    if (wasBusy) setTimeout(() => say(from), 80);
    else {
      speechSynthesis.resume();
      say(from);
    }
  }

  /** Una frase suelta (identificación de la emisora). Termina al acabar de hablar, con error o a los 8 s. */
  private sayOnce(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    const token = ++this.voiceToken;
    return new Promise<void>((resolve) => {
      const done = () => {
        if (token === this.voiceToken) this.identActive = false;
        resolve();
      };
      // La identificación sale de los mensajes de la app: va en el idioma de la interfaz, no en el de la emisora.
      const u = this.utter(text, document.documentElement.lang.startsWith('en') ? 'en' : 'es');
      u.onend = done;
      u.onerror = done;
      // cancel() seguido de speak() hace que Chrome corte la frase nueva ("interrupted"): solo se cancela si había
      // voz, y entonces se espera un momento. Sin voz previa, speak() va dentro del toque (lo piden los navegadores).
      const wasBusy = speechSynthesis.speaking || speechSynthesis.pending;
      this.identActive = true;
      const go = () => {
        if (token !== this.voiceToken) return done();
        speechSynthesis.resume();
        speechSynthesis.speak(u);
      };
      if (wasBusy) {
        speechSynthesis.cancel();
        setTimeout(go, 80);
      } else go();
      setTimeout(done, 8000);
    });
  }

  private stopVoice() {
    this.voiceToken++;
    if ((this.voiceActive || this.identActive) && 'speechSynthesis' in window) speechSynthesis.cancel();
    this.voiceActive = false;
    this.identActive = false;
  }

  private preloadNext() {
    const s = useRadioStore.getState();
    const nextSeg = s.segments[(s.index + 1) % s.segments.length];
    if (!nextSeg?.audioUrl || nextSeg.audioUrl === currentSegment()?.audioUrl) return;
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

  /** Baja el volumen mientras el asistente responde o la persona dicta por voz (la voz baja en la frase siguiente). */
  duck(on: boolean) {
    this.ducked = on;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(on ? 0.25 : 1, this.ctx.currentTime, 0.15);
    else if (this.audio) this.audio.volume = on ? 0.25 : 1;
  }

  /** Niveles 0–255 para el visualizador (sintéticos si suena la voz del navegador). */
  getLevels(): Uint8Array {
    if (this.voiceActive || this.identActive) {
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
