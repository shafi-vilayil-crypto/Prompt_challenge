// AI scoring with a fallback: Gemini first; prompts Gemini couldn't score go to Claude (if set up).

import type { Method } from './methods';
import { aiScore, geminiReady, type AiResult, type AiSettings } from './ai';
import { claudeReady, claudeScore, type ClaudeSettings } from './claude';

export const aiReady = (g: AiSettings, c: ClaudeSettings) => g.enabled && (geminiReady(g) || claudeReady(c));

export async function scoreWithFallback(
  g: AiSettings,
  c: ClaudeSettings,
  roundId: string,
  method: Method,
  question: string,
  prompts: { id: string; prompt: string }[],
  onBatch: (results: Record<string, AiResult>) => void,
) {
  const done = new Set<string>();
  const track = (res: Record<string, AiResult>) => { Object.keys(res).forEach((id) => done.add(id)); onBatch(res); };
  let geminiError: Error | null = null;

  if (geminiReady(g)) {
    try {
      await aiScore(g, method, question, prompts, (res) => {
        for (const id of Object.keys(res)) res[id].by = 'gemini';
        track(res);
      });
      return;
    } catch (e) {
      geminiError = e as Error;
    }
  }

  const rest = prompts.filter((p) => !done.has(p.id));
  if (!rest.length) return;
  if (!(g.enabled && claudeReady(c))) throw geminiError ?? new Error('Add a Gemini or Claude key in AI scoring.');
  try {
    await claudeScore(c, roundId, method, question, rest, track);
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(geminiError ? `Gemini: ${geminiError.message} Claude fallback: ${msg}` : msg);
  }
}
