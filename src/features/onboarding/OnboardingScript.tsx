import { getLocale, getTranslations } from 'next-intl/server';
import { NATURAL_VOICE, ROBOTIC_VOICE, VOICE_REGIONS } from '@/features/narrator/voices';

/** Íconos (trazos de lucide: gamepad-2, satellite, user-round-check, volume-2, volume-x) como SVG estático. */
const ICONS = {
  play: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  learn:
    '<path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5"/><path d="M16.5 7.5 19 5"/><path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5"/><path d="M9 21a6 6 0 0 0-6-6"/><path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z"/>',
  profile: '<path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="m16 19 2 2 4-4"/>',
  voice:
    '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  mute: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
};

/**
 * Bienvenida pintada con el primer HTML (antes era un componente diferido que aparecía tarde y se volvía el LCP).
 * Es un script en línea, sin React ni chunks: arma el diálogo durante el parseo y React 19 ignora los nodos extra
 * del <body> al hidratar.
 *  - Voz (speechSynthesis, para quien no sabe leer): la bienvenida se lee sola al abrir, con la voz elegida por las
 *    reglas de voices.ts. Chrome y Safari no dejan hablar antes del primer toque: si la bloquean, empieza con el primer
 *    toque en la pantalla (o, si ese toque es "¡A jugar!", la primera pregunta se lee sola). Mientras habla, el botón
 *    grande dice "Silenciar la voz": apagarla se recuerda (NARRATOR_KEY = '0') y tampoco hablan los retos. Volver a
 *    encenderla con el botón enciende el locutor (NARRATOR_KEY = '1').
 *  - "¡A jugar!" pide el inicio tipo juego (React, OnboardingGate en FirstLayer: personaje, los 7 retos del glosario
 *    y el perfil) con window.__fsQuiz=1 y el evento
 *    `fieldshift:onboarding-questions`; el cuestionario oculta esta bienvenida al tomar el relevo. Si el chunk no
 *    llega en 15 s (sin globo, sin red), se cierra sola.
 *  - "Saltar" / Esc: deja la app como está (modo completo).
 * Una sola vez (localStorage `fieldshift:onboarded:v2`), se salta en enlaces compartidos y en el modo demo, y Ajustes la
 * vuelve a mostrar con el evento `fieldshift:replay-onboarding`. Al cerrarla, el foco va al título de la página.
 * Avisa con `fieldshift:narrator` cuando lee, para que la radio baje el volumen.
 */
export async function OnboardingScript() {
  const t = await getTranslations('onboarding');
  const locale = await getLocale();
  const data = {
    title: t('welcome.title'),
    text: t('welcome.text'),
    hint: t('welcome.hint'),
    chips: (['play', 'learn', 'profile'] as const).map((id) => ({ label: t(`welcome.${id}`), icon: ICONS[id] })),
    spoken: [t('welcome.title'), t('welcome.text'), t('welcome.hint'), t('welcome.spokenEnd'), t('welcome.spokenMute')]
      .join('. ')
      .replace(/\.\./g, '.'),
    voice: ICONS.voice,
    mute: ICONS.mute,
    voiceOff: t('voice.listen'),
    voiceMute: t('voice.mute'),
    voiceNote: t('voice.note'),
    voiceTap: t('voice.tap'),
    brand: t('brand'),
    skip: t('skip'),
    start: t('start'),
    preparing: t('preparing'),
    lang: locale === 'en' ? 'en' : 'es',
    // Reglas para elegir la voz (las mismas de pickVoice): región preferida, sin voces robóticas, natural si hay.
    vr: VOICE_REGIONS[locale === 'en' ? 'en' : 'es'],
    bad: ROBOTIC_VOICE.source,
    good: NATURAL_VOICE.source,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const script = `(function(){
var D=${json};var K='fieldshift:onboarded:v2',NK='fieldshift:narrator';
var S='speechSynthesis' in window&&typeof SpeechSynthesisUtterance==='function'?window.speechSynthesis:null;
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return'&#'+c.charCodeAt(0)+';'})}
function svg(p,c){return'<svg aria-hidden="true" viewBox="0 0 24 24" class="'+c+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'}
var root=document.createElement('div');root.id='onboarding';root.setAttribute('data-overlay-dialog','');root.hidden=true;
root.className='fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center';
root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="onb-title" aria-describedby="onb-text" class="panel relative m-0 flex w-full max-w-md flex-col gap-4 rounded-t-3xl p-6 pb-[calc(var(--safe-bottom)+1.5rem)] shadow-2xl sm:m-4 sm:rounded-3xl">'
+'<div class="flex items-center justify-between"><p class="text-xs font-semibold tracking-wider text-ink-muted uppercase">'+esc(D.brand)+'</p>'
+'<button type="button" data-onb="skip" class="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-white/10">'+esc(D.skip)+'</button></div>'
+'<div class="flex flex-col items-center gap-2 text-center"><h2 id="onb-title" class="text-2xl font-bold">'+esc(D.title)+'</h2><p id="onb-text" class="text-base text-ink-muted">'+esc(D.text)+'</p></div>'
+'<ul class="grid grid-cols-3 gap-2">'+D.chips.map(function(c){return'<li class="flex flex-col items-center gap-1.5 rounded-2xl bg-white/5 p-2 text-center text-xs font-semibold ring-1 ring-line"><span class="grid size-12 place-items-center rounded-2xl bg-field-500/15 text-field-300">'+svg(c.icon,'size-7')+'</span>'+esc(c.label)+'</li>'}).join('')+'</ul>'
+'<p class="text-center text-sm text-ink-muted">'+esc(D.hint)+'</p>'
+(S?'<div class="flex flex-col gap-1"><button type="button" data-onb="voice" class="flex min-h-14 items-center justify-center gap-3 rounded-2xl px-4 text-lg font-semibold"><span aria-hidden="true" data-onb-icon class="contents"></span><span data-onb-label></span></button>'
+'<p data-onb-note aria-live="polite" class="text-center text-xs text-ink-faint"></p></div>':'')
+'<button type="button" data-onb="next" class="flex min-h-14 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400"><span>'+esc(D.start)+'</span>'
+'<svg aria-hidden="true" viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button></section>';
document.body.appendChild(root);
var next=root.querySelector('[data-onb=next]'),voice=root.querySelector('[data-onb=voice]'),note=root.querySelector('[data-onb-note]'),timer=0;
/* Voz: idle | starting (pidió hablar) | talking | wait (el navegador pide un toque antes). */
var state='idle',spoke=false,gen=0,waitT=0,BAD=new RegExp(D.bad,'i'),GOOD=new RegExp(D.good,'i');
function muted(){return get(NK)==='0'}
function ev(on){window.dispatchEvent(new CustomEvent('fieldshift:narrator',{detail:on}))}
function set(s){if(state==='talking'&&s!=='talking')ev(false);if(s==='talking'&&state!=='talking')ev(true);state=s;paint()}
/* La misma cuenta que voiceScore (src/features/narrator/voices.ts). */
function pick(){var vs=S.getVoices(),best=null,bs=-1/0;for(var i=0;i<vs.length;i++){var x=vs[i],t=x.lang.replace('_','-').toLowerCase();if(t!==D.lang&&t.indexOf(D.lang+'-')!==0)continue;
var r=D.vr.indexOf(t),id=x.name+' '+x.voiceURI,s=(r<0?0:10*(D.vr.length-r))+(BAD.test(id)?-100:0)+(GOOD.test(id)?25:/google/i.test(id)?5:0)+(x.default?1:0);if(s>bs){bs=s;best=x}}return best}
function hush(){gen++;clearTimeout(waitT);if(S&&(S.speaking||S.pending))S.cancel();set('idle')}
function say(now){if(!S)return;var my=++gen;
/* Chrome entrega las voces tarde (hasta ~3 s la primera vez): sin un toque de por medio, se esperan para no hablar con la que toque. */
if(!now&&!S.getVoices().length){var go=function(){if(S.removeEventListener)S.removeEventListener('voiceschanged',go);clearTimeout(vt);if(my===gen&&!root.hidden&&!muted())say(true)};
if(S.addEventListener)S.addEventListener('voiceschanged',go);var vt=setTimeout(go,3500);set('starting');return}
if(S.speaking||S.pending)S.cancel();
var v=pick(),parts=D.spoken.split(/(?<=[.!?])\\s+/);set('starting');clearTimeout(waitT);
waitT=setTimeout(function(){if(my===gen&&state==='starting')set('wait')},800);
parts.forEach(function(p,k){var u=new SpeechSynthesisUtterance(p);u.lang=v?v.lang:(D.lang==='en'?'en-US':'es-ES');if(v)u.voice=v;u.rate=.95;
u.onstart=function(){if(my!==gen)return;spoke=true;clearTimeout(waitT);if(state!=='talking')set('talking')};
if(k===parts.length-1)u.onend=function(){if(my===gen)set('idle')};
u.onerror=function(e){if(my!==gen)return;clearTimeout(waitT);set(!spoke||e.error==='not-allowed'?'wait':'idle')};S.speak(u)})}
/* Para iOS: una frase muda dentro del toque de "¡A jugar!" deja que la primera pregunta se lea sola. */
function unlock(){if(!S||S.speaking||S.pending)return;var u=new SpeechSynthesisUtterance(' ');u.volume=0;S.speak(u)}
function paint(){if(!voice)return;var on=state==='talking'||state==='starting',wait=state==='wait'&&!muted();
voice.querySelector('[data-onb-icon]').innerHTML=svg(on?D.mute:D.voice,'size-7');voice.querySelector('[data-onb-label]').textContent=on?D.voiceMute:D.voiceOff;
note.textContent=wait?D.voiceTap:D.voiceNote;
voice.className='flex min-h-14 items-center justify-center gap-3 rounded-2xl px-4 text-lg font-semibold '+(on||wait?'bg-field-500/20 ring-2 ring-field-400 text-field-300':'bg-white/5 ring-1 ring-line hover:bg-white/10')}
function label(t){next.querySelector('span').textContent=t}
function open(){window.__fsQuiz=0;clearTimeout(timer);next.removeAttribute('aria-busy');label(D.start);spoke=false;state='idle';root.hidden=false;setTimeout(function(){next.focus()},0);if(S&&!muted())say(false);paint()}
function done(){clearTimeout(timer);window.__fsQuiz=0;put(K,'1');hush();root.hidden=true;var h=document.querySelector('h1');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true})}window.dispatchEvent(new Event('fieldshift:onboarded'))}
next.addEventListener('click',function(){if(window.__fsQuiz)return;window.__fsQuiz=1;next.setAttribute('aria-busy','true');label(D.preparing);
window.dispatchEvent(new Event('fieldshift:onboarding-questions'));timer=setTimeout(function(){if(window.__fsQuiz===1)done()},15000)});
if(voice)voice.addEventListener('click',function(){if(state==='talking'||state==='starting'){put(NK,'0');hush()}else{put(NK,'1');say(true)}});
/* Si el navegador no dejó hablar al abrir, el primer toque en la pantalla empieza la bienvenida. */
function tap(e){if(root.hidden||!S||muted()||spoke||state==='talking')return;var b=e&&e.target&&e.target.closest?e.target.closest('[data-onb]'):null,w=b&&b.getAttribute('data-onb');
if(w==='voice'||w==='skip')return;if(w==='next')return unlock();say(true)}
root.addEventListener('click',tap,true);
root.querySelector('[data-onb=skip]').addEventListener('click',done);
document.addEventListener('keydown',function(e){if(root.hidden)return;if(e.key==='Escape')return done();if(e.key==='Tab')tap(null)});
window.addEventListener('fieldshift:replay-onboarding',open);
var skipUrl=/[?&](field|demo|view|region)=/.test(location.search);
if(get(K)!=='1'&&!skipUrl)open();
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
