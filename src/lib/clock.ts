import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Difference between the server clock and this device's clock, in ms.
let offset = 0;

export async function syncClock() {
  const before = Date.now();
  const { data, error } = await supabase.rpc('server_now');
  if (error || !data) return;
  const after = Date.now();
  offset = new Date(data as string).getTime() - (before + after) / 2;
}

export const serverNow = () => Date.now() + offset;

/** Seconds left until `endsAt` (server time), updated 4 times a second. */
export function useSecondsLeft(endsAt: string | null | undefined): number {
  const calc = () => (endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - serverNow()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const t = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return left;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
