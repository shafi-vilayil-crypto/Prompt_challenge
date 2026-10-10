import { mmss, useSecondsLeft } from '../lib/clock';

export function Timer({ endsAt, big }: { endsAt: string; big?: boolean }) {
  const left = useSecondsLeft(endsAt);
  const cls = left === 0 ? 'done' : left <= 10 ? 'low' : '';
  return (
    <div className={`timer ${cls}${big ? ' big' : ''}`} role="timer" aria-live="off">
      {left === 0 ? "Time's up" : mmss(left)}
    </div>
  );
}
