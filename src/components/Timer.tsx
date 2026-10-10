import { mmss, useSecondsLeft } from '../lib/clock';

export function Timer({ endsAt, big, doneLabel = "Time's up" }: { endsAt: string; big?: boolean; doneLabel?: string }) {
  const left = useSecondsLeft(endsAt);
  const cls = left === 0 ? 'done' : left <= 10 ? 'low' : '';
  return (
    <div className={`timer ${cls}${big ? ' big' : ''}`} role="timer" aria-live="off">
      {left === 0 ? doneLabel : mmss(left)}
    </div>
  );
}
