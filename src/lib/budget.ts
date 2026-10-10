// Cost controls for AI scoring, all kept in the teacher's browser:
// - a daily and per-round cap on Claude calls, with a running cost estimate
// - AI results saved per round, so reloading the page never pays to score the same prompts again
// - a lock so only one open teacher tab calls the AI at a time

const USAGE_KEY = 'prompt-challenge.claude-usage';
const RESULTS_KEY = 'prompt-challenge.ai-results';
const LOCK_KEY = 'prompt-challenge.ai-lock';

/** Most prompts per round sent to the AI. Beyond this they keep the word check (protects against fake floods). */
export const MAX_AI_PROMPTS_PER_ROUND = 80;
/** Automatic AI attempts per prompt; after that only the teacher's "Score with AI" button tries again. */
export const MAX_AUTO_ATTEMPTS = 6;
/** Wait before the next automatic try after consecutive errors: 1, 2, 4, then 5 minutes. */
export const backoffMs = (failures: number) => Math.min(60_000 * 2 ** Math.max(0, failures - 1), 5 * 60_000);

// ───────────── Claude usage and limits ─────────────

// USD per million tokens (input, output). Estimates for the teacher's information only.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
const FALLBACK_PRICE: [number, number] = [5, 25];

export type ClaudeUsage = { day: string; calls: number; usd: number; rounds: Record<string, number> };

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export function loadUsage(): ClaudeUsage {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    if (u && u.day === today()) return { day: u.day, calls: u.calls || 0, usd: u.usd || 0, rounds: u.rounds || {} };
  } catch { /* fall through */ }
  return { day: today(), calls: 0, usd: 0, rounds: {} };
}

function saveUsage(u: ClaudeUsage) {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('claude-usage'));
}

export class BudgetError extends Error {}

/** Throws before a Claude call that would go over a limit. */
export function checkClaudeBudget(roundId: string, perDay: number, perRound: number) {
  const u = loadUsage();
  if (u.calls >= perDay) throw new BudgetError(`Claude daily limit reached (${perDay} calls). Raise it in Claude fallback settings, or score by hand.`);
  if ((u.rounds[roundId] ?? 0) >= perRound) throw new BudgetError(`Claude limit for this round reached (${perRound} calls). The rest keep the word check.`);
}

/** Records one Claude call (counted even when it failed after the request was sent). */
export function recordClaudeCall(roundId: string, model: string, inputTokens = 0, outputTokens = 0) {
  const u = loadUsage();
  const [pin, pout] = PRICES[model] ?? FALLBACK_PRICE;
  u.calls += 1;
  u.rounds[roundId] = (u.rounds[roundId] ?? 0) + 1;
  u.usd += (inputTokens * pin + outputTokens * pout) / 1_000_000;
  saveUsage(u);
}

// ───────────── Saved AI results per round ─────────────

type SavedResults = Record<string, Record<string, unknown>>; // roundId -> { submissionId -> AiResult }

export function loadSavedResults<T>(roundId: string): Record<string, T> {
  try {
    const all: SavedResults = JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}') || {};
    return (all[roundId] as Record<string, T>) ?? {};
  } catch {
    return {};
  }
}

export function saveResults<T>(roundId: string, results: Record<string, T>) {
  try {
    const all: SavedResults = JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}') || {};
    delete all[roundId];
    all[roundId] = results as Record<string, unknown>;
    const keep = Object.keys(all).slice(-5); // only the last few rounds
    localStorage.setItem(RESULTS_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch { /* storage full or blocked: results stay in memory */ }
}

// ───────────── One tab at a time ─────────────

const TAB_ID = Math.random().toString(36).slice(2);
const LEASE_MS = 30_000;

/** True if this tab may call the AI now. Another open teacher tab holding a fresh lock means no. */
export function takeAiLock(): boolean {
  try {
    const now = Date.now();
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (lock && lock.tab !== TAB_ID && lock.until > now) return false;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: TAB_ID, until: now + LEASE_MS }));
    return true;
  } catch {
    return true; // storage blocked: can't coordinate, so allow
  }
}

export function releaseAiLock() {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (lock?.tab === TAB_ID) localStorage.removeItem(LOCK_KEY);
  } catch { /* ignore */ }
}
