// Claude as the fallback scorer when Gemini fails (busy, rate limit, errors).
// Called from the teacher's browser only; the key is kept in this browser's storage, like the Gemini key.

import type Anthropic from '@anthropic-ai/sdk';
import type { Method } from './methods';
import { instructions, parse, type AiResult } from './ai';

const KEY = 'prompt-challenge.claude';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const BATCH = 20;

export type ClaudeSettings = { enabled: boolean; apiKey: string; model: string };

export function loadClaude(): ClaudeSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.apiKey === 'string') return { enabled: Boolean(s.enabled), apiKey: s.apiKey, model: s.model || DEFAULT_CLAUDE_MODEL };
  } catch { /* fall through */ }
  return { enabled: false, apiKey: '', model: DEFAULT_CLAUDE_MODEL };
}

export function saveClaude(s: ClaudeSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: works for this visit */ }
}

export const claudeReady = (c: ClaudeSettings) => c.enabled && c.apiKey.trim().length > 20;

// Server-side refusal fallback ("default") is offered on these models.
const supportsDefaultFallback = (model: string) => /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/.test(model);

// The SDK is loaded only when Claude is actually called, so students' phones never download it.
type Sdk = typeof Anthropic;
const loadSdk = async (): Promise<Sdk> => (await import('@anthropic-ai/sdk')).default;

function client(A: Sdk, c: ClaudeSettings) {
  // The key lives only in the teacher's own browser, so a direct browser call is acceptable here.
  return new A({ apiKey: c.apiKey.trim(), dangerouslyAllowBrowser: true, timeout: 60_000, maxRetries: 2 });
}

/** JSON shape Claude must reply in: only this method's part ids, bonus 0-3. */
function schema(method: Method) {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            parts: { type: 'array', items: { type: 'string', enum: method.parts.map((p) => p.id) } },
            bonus: { type: 'integer', enum: [0, 1, 2, 3] },
            comment: { type: 'string' },
          },
          required: ['id', 'parts', 'bonus', 'comment'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

function friendlyClaudeError(A: Sdk, e: unknown, model: string): Error {
  if (e instanceof A.AuthenticationError) return new Error('Claude rejected the API key. Check it in AI scoring settings.');
  if (e instanceof A.PermissionDeniedError) return new Error("Claude refused this key (403). Check the key's permissions in the Anthropic console.");
  if (e instanceof A.NotFoundError) return new Error(`Claude doesn't know the model "${model}". Try ${DEFAULT_CLAUDE_MODEL}.`);
  if (e instanceof A.RateLimitError) return new Error('Claude rate limit reached. Wait a minute and try again.');
  if (e instanceof A.BadRequestError && /credit balance/i.test(e.message)) return new Error('Your Anthropic credit balance is too low. Add credit at console.anthropic.com.');
  if (e instanceof A.APIConnectionError) return new Error("Can't reach Claude. Check the internet connection.");
  if (e instanceof A.APIError) return new Error(`Claude error ${e.status ?? ''}: ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
}

async function ask(c: ClaudeSettings, method: Method, text: string, signal?: AbortSignal): Promise<string> {
  const model = c.model.trim() || DEFAULT_CLAUDE_MODEL;
  const A = await loadSdk();
  try {
    const response = await client(A, c).beta.messages.create(
      {
        model,
        max_tokens: 16000,
        ...(supportsDefaultFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(method) } },
        messages: [{ role: 'user', content: text }],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to score these prompts.');
    if (response.stop_reason === 'max_tokens') throw new Error("Claude's answer was cut off. Try again.");
    return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (e) {
    throw friendlyClaudeError(A, e, model);
  }
}

/** Scores prompts with Claude in batches; calls onBatch as each batch arrives. */
export async function claudeScore(
  c: ClaudeSettings,
  method: Method,
  question: string,
  prompts: { id: string; prompt: string }[],
  onBatch: (results: Record<string, AiResult>) => void,
  signal?: AbortSignal,
) {
  for (let i = 0; i < prompts.length; i += BATCH) {
    const batch = prompts.slice(i, i + BATCH);
    const raw = await ask(c, method, instructions(method, question, batch), signal);
    const res = parse(raw, method);
    for (const id of Object.keys(res)) res[id].by = 'claude';
    onBatch(res);
  }
}

/** A tiny request to check the key and model work. */
export async function claudeTest(c: ClaudeSettings): Promise<void> {
  const model = c.model.trim() || DEFAULT_CLAUDE_MODEL;
  const A = await loadSdk();
  try {
    const response = await client(A, c).messages.create({
      model,
      max_tokens: 1000,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    if (!response.content.some((b) => b.type === 'text')) throw new Error('Claude answered, but not as expected.');
  } catch (e) {
    throw friendlyClaudeError(A, e, model);
  }
}
