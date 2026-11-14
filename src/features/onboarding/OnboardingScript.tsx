import { getLocale, getTranslations } from 'next-intl/server';

/** Íconos (trazos de lucide: search, cloud-sun, sprout, volume-2) como SVG estático. */
const ICONS = {
  find: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  climate:
    '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  compare:
    '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
  voice:
    '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
};

/**
 * Bienvenida pintada con el primer HTML (antes era un componente diferido que aparecía tarde y se volvía el LCP).
 * Es un script en línea, sin React ni chunks: arma el diálogo durante el parseo y React 19 ignora los nodos extra
 * del <body> al hidratar. Tiene el botón del locutor (voz del teléfono, speechSynthesis) para quien no sabe leer.
 *  - "Empezar" pide las preguntas de inicio (React, OnboardingGate en FirstLayer) con window.__fsQuiz=1 y el evento
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
    chips: (['find', 'climate', 'compare'] as const).map((id) => ({ label: t(`welcome.${id}`), icon: ICONS[id] })),
    spoken: [t('welcome.title'), t('welcome.text'), t('welcome.hint'), t('welcome.spokenEnd')].join('. ').replace(/\.\./g, '.'),
    voice: ICONS.voice,
    voiceOff: t('voice.listen'),
    voiceOn: t('voice.on'),
    voiceNote: t('voice.note'),
    brand: t('brand'),
    skip: t('skip'),
    start: t('start'),
    preparing: t('preparing'),
    lang: locale === 'en' ? 'en' : 'es',
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
+(S?'<div class="flex flex-col gap-1"><button type="button" data-onb="voice" aria-pressed="false" class="flex min-h-14 items-center justify-center gap-3 rounded-2xl px-4 text-lg font-semibold ring-1">'+svg(D.voice,'size-7')+'<span></span></button>'
+'<p class="text-center text-xs text-ink-faint">'+esc(D.voiceNote)+'</p></div>':'')
+'<button type="button" data-onb="next" class="flex min-h-14 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400"><span>'+esc(D.start)+'</span>'
+'<svg aria-hidden="true" viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button></section>';
document.body.appendChild(root);
var next=root.querySelector('[data-onb=next]'),voice=root.querySelector('[data-onb=voice]'),timer=0;
function ev(on){window.dispatchEvent(new CustomEvent('fieldshift:narrator',{detail:on}))}
function hush(){if(S&&S.speaking){S.cancel();ev(false)}}
function say(){if(!S)return;S.cancel();var vs=S.getVoices(),v=null,pref=D.lang==='en'?['en-us','en-gb']:['es-co','es-419','es-mx','es-us','es-es'];
for(var i=0;i<pref.length&&!v;i++)v=vs.filter(function(x){return x.lang.replace('_','-').toLowerCase()===pref[i]})[0]||null;
if(!v)v=vs.filter(function(x){return x.lang.toLowerCase().indexOf(D.lang)===0})[0]||null;
var parts=D.spoken.split(/(?<=[.!?])\\s+/);ev(true);
parts.forEach(function(p,k){var u=new SpeechSynthesisUtterance(p);u.lang=v?v.lang:(D.lang==='en'?'en-US':'es-ES');if(v)u.voice=v;u.rate=.95;
if(k===parts.length-1)u.onend=function(){ev(false)};u.onerror=function(){ev(false)};S.speak(u)})}
function paint(){if(!voice)return;var on=get(NK)==='1';voice.setAttribute('aria-pressed',on?'true':'false');voice.querySelector('span').textContent=on?D.voiceOn:D.voiceOff;
voice.className='flex min-h-14 items-center justify-center gap-3 rounded-2xl px-4 text-lg font-semibold ring-1 '+(on?'bg-field-500/20 ring-2 ring-field-400 text-field-300':'bg-white/5 ring-line hover:bg-white/10')}
function label(t){next.querySelector('span').textContent=t}
function open(){window.__fsQuiz=0;clearTimeout(timer);next.removeAttribute('aria-busy');label(D.start);paint();root.hidden=false;setTimeout(function(){next.focus()},0);if(get(NK)==='1')say()}
function done(){clearTimeout(timer);window.__fsQuiz=0;put(K,'1');hush();root.hidden=true;var h=document.querySelector('h1');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true})}window.dispatchEvent(new Event('fieldshift:onboarded'))}
next.addEventListener('click',function(){if(window.__fsQuiz)return;window.__fsQuiz=1;next.setAttribute('aria-busy','true');label(D.preparing);
window.dispatchEvent(new Event('fieldshift:onboarding-questions'));timer=setTimeout(function(){if(window.__fsQuiz===1)done()},15000)});
if(voice)voice.addEventListener('click',function(){var on=get(NK)!=='1';put(NK,on?'1':'0');paint();if(on)say();else hush()});
root.querySelector('[data-onb=skip]').addEventListener('click',done);
document.addEventListener('keydown',function(e){if(!root.hidden&&e.key==='Escape')done()});
window.addEventListener('fieldshift:replay-onboarding',open);
var skipUrl=/[?&](field|demo|view|region)=/.test(location.search);
if(get(K)!=='1'&&!skipUrl)open();
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
