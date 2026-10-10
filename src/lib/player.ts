// The student's identity lives only on their phone: a random id and the name they typed.

const KEY = 'prompt-challenge.player';

export type Player = { id: string; name: string };

export function loadPlayer(): Player | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    return p && typeof p.id === 'string' && typeof p.name === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function savePlayer(name: string): Player {
  const existing = loadPlayer();
  const p = { id: existing?.id ?? crypto.randomUUID(), name: name.trim().slice(0, 40) };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: works for this visit */ }
  return p;
}
