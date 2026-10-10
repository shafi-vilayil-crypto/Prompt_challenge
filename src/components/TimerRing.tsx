import { mmss, useSecondsLeft } from '../lib/clock';

/** Countdown as a ring that empties as time runs out. */
export function TimerRing({ startedAt, endsAt, doneLabel, huge }: { startedAt: string; endsAt: string; doneLabel: string; huge?: boolean }) {
  const left = useSecondsLeft(endsAt);
  const total = Math.max(1, (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 1000);
  const frac = Math.max(0, Math.min(1, left / total));
  const R = 34;
  const C = 2 * Math.PI * R;
  const state = left === 0 ? 'done' : left <= 10 ? 'low' : '';
  return (
    <div className={`timer-ring ${state}${huge ? ' huge' : ''}`} role="timer" aria-label={left === 0 ? doneLabel : mmss(left)}>
      <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
        <circle cx="40" cy="40" r={R} className="ring-track" />
        <circle cx="40" cy="40" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <span className="ring-text">{left === 0 ? '0:00' : mmss(left)}</span>
    </div>
  );
}
