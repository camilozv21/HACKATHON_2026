/**
 * Sugerencia de perfil con Claude (solo servidor): con las 3 respuestas de inicio (rol, objetivo, cómo prefiere la
 * información) propone modo sencillo o completo, voz, un saludo, razones, el primer paso y preguntas para el chat.
 * La persona confirma la sugerencia antes de aplicarla. Si falla, /api/profile usa las reglas locales.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { DISPLAY_MODES, FIRST_STEPS, ProfileSuggestion, type ProfileRequest } from '@/lib/api/contract';

const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
/** Respuesta rápida o nada: la persona está esperando en la pantalla "Pensando…" (el cliente corta a 9 s). */
const getClient = () => (client ??= new Anthropic({ timeout: 8_000, maxRetries: 0 }));

const SYSTEM = `You set up Field Shift for a new user. Field Shift is a web app with a 3D globe that helps farmers explore crop rotations using NASA Earth observation data (rain, soil moisture, plant greenness, ground heat, groundwater).

You receive the user's answers to three start-up questions:
- role: "farmer" or "technician" (agronomist, extension worker).
- goal: "climate" (see how weather and soil are in their area), "rotations" (choose what to plant on their farm) or "satellite" (explore NASA satellite layers).
- reading: "listen" (they prefer to hear the information; they may not be able to read), "little" (short sentences and pictures) or "detail" (all the data).

Suggest how the app should look for them:
- mode "lite": the simple view. Fewer numbers, no technical lines (mission, resolution), short sentences, the most important data first. Best for people who read little or prefer to listen.
- mode "full": every data card, charts, sources, dates and resolution. Best for technicians and people who want detail.
- narrator: true if a voice should read the screens aloud. Always true when reading is "listen".
- firstStep: "myArea" (open the conditions of their area), "myFarm" (mark their farm to compare rotations), "layers" (open the satellite layers) or "explore" (just the globe).

Write in the language given by "locale" ("es" = Spanish with informal "tú", "en" = English). The texts may be read aloud by a phone voice: plain words, no symbols, no abbreviations, no markdown, no emojis.
- welcome: one or two short sentences that greet the user and say what they will see first.
- reasons: two or three very short reasons for this setup, based on their answers.
- suggestions: three short questions they could ask the field assistant first, matching their role and goal (for example about rain or soil in their area, or what to plant).

Never promise results. The app supports, and does not replace, the farmer's judgement or local experts.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'narrator', 'welcome', 'reasons', 'suggestions', 'firstStep'],
  properties: {
    mode: { type: 'string', enum: [...DISPLAY_MODES] },
    narrator: { type: 'boolean' },
    welcome: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    firstStep: { type: 'string', enum: [...FIRST_STEPS] },
  },
} as const;

export async function suggestProfileWithClaude(req: ProfileRequest): Promise<ProfileSuggestion> {
  const msg = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA) },
    messages: [{ role: 'user', content: JSON.stringify({ locale: req.locale, answers: req.answers }) }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('claude_refusal');

  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const raw = JSON.parse(text) as Record<string, unknown>;
  // Recorta en vez de rechazar: un texto un poco largo no debe tumbar la sugerencia entera.
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : v);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 3).map((s) => clip(s, 160)).filter(Boolean) : v);
  const parsed = ProfileSuggestion.safeParse({
    ...raw,
    role: req.answers.role,
    welcome: clip(raw.welcome, 280),
    reasons: list(raw.reasons),
    suggestions: list(raw.suggestions),
    source: 'claude',
  });
  if (!parsed.success) throw new Error('claude_out_of_contract');
  return parsed.data;
}
