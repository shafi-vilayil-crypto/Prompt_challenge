import type { LeaderRow } from '../lib/supabase';

/** Top three as a podium: 2nd, 1st, 3rd. Ties share a rank. */
export function Podium({ rows, highlight, youLabel }: { rows: LeaderRow[]; highlight?: string; youLabel: string }) {
  const top = rows.slice(0, 3);
  if (!top.length) return null;
  const rankOf = (r: LeaderRow) => 1 + rows.filter((o) => o.total > r.total).length;
  const order = [top[1], top[0], top[2]].filter(Boolean) as LeaderRow[];
  return (
    <div className="podium" role="list">
      {order.map((r) => {
        const rank = rankOf(r);
        return (
          <div key={r.player_id} role="listitem" className={`podium-step p${rank}${r.player_id === highlight ? ' me' : ''}`}>
            <span className="podium-avatar">{r.name.trim().charAt(0).toUpperCase() || '?'}</span>
            <span className="podium-name">{r.name}{r.player_id === highlight && <span className="you">{youLabel}</span>}</span>
            <span className="podium-points">{r.total}</span>
            <span className="podium-block">{rank}</span>
          </div>
        );
      })}
    </div>
  );
}
