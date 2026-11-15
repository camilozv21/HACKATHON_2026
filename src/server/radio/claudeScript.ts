/**
 * Claude reescribe el borrador del programa (src/server/radio/script.ts) con voz de locutor de radio rural.
 * Solo cambia el texto: los datos, las fuentes, la confianza, los vacíos y las pistas sobre el globo son los del
 * borrador. Un bloque con un número que no estaba en el borrador se descarta y suena el de plantillas.
 * Solo servidor (ANTHROPIC_API_KEY en .env.local).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { RADIO_TOPICS, type RadioSegment, type RadioTopic } from '@/lib/api/contract';
import { speechSeconds, splitSentences } from '@/features/radio/sentences';

const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
/** El programa de plantillas ya está sonando: si Claude tarda más de 20 s, se queda ese. */
const getClient = () => (client ??= new Anthropic({ timeout: 20_000, maxRetries: 0 }));

export const claudeRadioEnabled = () => process.env.AGENT_FORCE_MOCK !== 'true' && Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const SYSTEM = `You are the voice of "Radio Campo", the farm radio inside Field Shift, a web app that helps farmers read NASA Earth observation data. You turn a draft bulletin into a script that a phone voice will read aloud.

You receive JSON with: locale ("es" = Spanish using informal "tú", "en" = English), the listener profile (role "farmer" or "technician", mode "lite" = simple view or "full") and the draft segments, each with a topic and its sentences.

Rewrite each segment so it sounds like a warm, clear rural radio host:
- Keep every segment and its topic, in the same order. Do not add or drop segments.
- Keep every fact, number, source name, date, warning and limitation of the draft. Do not add new numbers, dates, places or facts: if it is not in the draft, it does not go in the script. Write numbers with digits exactly as the draft writes them.
- Say the source by voice when the draft names it (for example "según el satélite SMAP de la NASA"). If the draft says a value is a demo value, test data or not verified, say it just as clearly.
- Short sentences (at most about 20 words). Each sentence ends with a period, a question mark or an exclamation mark. No lists, no symbols, no abbreviations, no emojis, no markdown.
- Length: about the same number of sentences as the draft (one more or one fewer at most). In mode "lite", at most 2 sentences per segment.
- Role "farmer": everyday words; when the draft uses a technical term (NDVI, evapotranspiration, risk zone), keep it and explain it in a few words. Role "technician": you may keep mission names and units.
- Link the segments naturally (for example "Y ahora, el suelo."), but do not repeat the greeting.
- The last segment must keep the reminder that the information supports, and does not replace, the farmer's judgement or local experts.
- Never promise results and never give a forecast: rain values are what satellites measured.

For each segment also write a short title (at most 5 words) in the same language.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'title', 'script'],
        properties: {
          topic: { type: 'string', enum: [...RADIO_TOPICS] },
          title: { type: 'string' },
          script: { type: 'string' },
        },
      },
    },
  },
} as const;

/** Números del texto (solo las cifras: "1.250" → 1, 250; "12,5" → 12, 5). */
const numbersIn = (text: string) => new Set(text.match(/\d+/g) ?? []);

/** El guion nuevo no trae ningún número que no estuviera en el borrador. */
export function keepsNumbers(draft: string, script: string) {
  const allowed = numbersIn(draft);
  for (const n of numbersIn(script)) if (!allowed.has(n)) return false;
  return true;
}

/** Une el texto de Claude con los datos del borrador; un bloque que no pasa los controles queda como estaba. */
export function mergeRewrite(
  draft: RadioSegment[],
  rewrite: { topic: string; title: string; script: string }[],
  opts: { lite: boolean },
): { segments: RadioSegment[]; replaced: number } {
  const byTopic = new Map(rewrite.map((r) => [r.topic as RadioTopic, r]));
  let replaced = 0;
  const segments = draft.map((seg) => {
    const r = seg.topic ? byTopic.get(seg.topic) : undefined;
    const script = r?.script.replace(/\s+/g, ' ').trim() ?? '';
    if (!r || !script || script.length > 900 || !keepsNumbers(seg.transcript, script)) return seg;
    const before = splitSentences(seg.transcript).length;
    const after = splitSentences(script).length;
    if (after === 0 || after > before + 2) return seg;
    replaced++;
    // Las pistas se mueven a la frase equivalente del guion nuevo.
    const cues = seg.cues?.map((c) => ({ ...c, sentence: before <= 1 ? 0 : Math.min(after - 1, Math.round((c.sentence / (before - 1)) * (after - 1))) }));
    const title = r.title.trim().slice(0, 60) || seg.title;
    return {
      ...seg,
      title,
      transcript: script,
      durationSec: speechSeconds(script, opts.lite ? 0.92 : 1),
      ...(cues ? { cues } : {}),
    };
  });
  return { segments, replaced };
}

export async function rewriteWithClaude(
  draft: RadioSegment[],
  ctx: { locale: 'es' | 'en'; role?: 'farmer' | 'technician'; mode: 'lite' | 'full' },
): Promise<{ segments: RadioSegment[]; replaced: number }> {
  const input = {
    locale: ctx.locale,
    profile: { role: ctx.role ?? 'farmer', mode: ctx.mode },
    segments: draft.map((s) => ({ topic: s.topic, sentences: splitSentences(s.transcript) })),
  };
  const msg = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA) },
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('claude_refusal');
  if (msg.stop_reason === 'max_tokens') throw new Error('claude_truncated');
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = JSON.parse(text) as { segments?: unknown };
  const list = Array.isArray(parsed.segments) ? parsed.segments : [];
  const rewrite = list.flatMap((r) => {
    const o = r as Record<string, unknown>;
    return typeof o.topic === 'string' && typeof o.title === 'string' && typeof o.script === 'string'
      ? [{ topic: o.topic, title: o.title, script: o.script }]
      : [];
  });
  return mergeRewrite(draft, rewrite, { lite: ctx.mode === 'lite' });
}
