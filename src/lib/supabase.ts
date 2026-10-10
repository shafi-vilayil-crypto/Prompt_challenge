import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || 'https://missing.supabase.co', key || 'missing', {
  auth: { persistSession: true, storageKey: 'prompt-challenge.auth' },
});

export type Round = {
  id: string;
  question: string;
  started_at: string;
  ends_at: string;
  published: boolean;
};

export type Submission = {
  id: string;
  round_id: string;
  player_id: string;
  name: string;
  prompt: string;
  parts: string[];
  bonus: number;
  score: number | null;
  created_at: string;
};

export type LeaderRow = { player_id: string; name: string; total: number; rounds: number };

export type Question = { id: string; text: string; created_at: string };

export async function latestRound(): Promise<Round | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Round | null;
}

export async function leaderboard(limit = 50): Promise<LeaderRow[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('total', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LeaderRow[];
}

/** Turns a Supabase/Postgres error into a sentence a teacher or student can act on. */
export function friendly(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  if (!e) return 'Something went wrong. Try again.';
  if (e.message && /fetch|network/i.test(e.message)) return 'No internet connection. Check Wi-Fi or mobile data and try again.';
  return e.message || 'Something went wrong. Try again.';
}
