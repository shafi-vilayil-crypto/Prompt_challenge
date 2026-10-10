import type { LeaderRow } from '../lib/supabase';

type Props = { rows: LeaderRow[]; highlight?: string; limit?: number; big?: boolean; emptyText?: string; youLabel?: string };

export function Leaderboard({ rows, highlight, limit = 10, big, emptyText = 'Scores appear here after the teacher publishes the first round.', youLabel = 'You' }: Props) {
  if (!rows.length) return <p className="muted">{emptyText}</p>;
  const top = Math.max(1, rows[0].total);
  const shown = rows.slice(0, limit);
  const mine = highlight ? rows.findIndex((r) => r.player_id === highlight) : -1;
  const rankOf = (r: LeaderRow) => 1 + rows.filter((o) => o.total > r.total).length;

  return (
    <ol className={`board${big ? ' big' : ''}`}>
      {shown.map((r) => (
        <Row key={r.player_id} r={r} rank={rankOf(r)} top={top} me={r.player_id === highlight} youLabel={youLabel} />
      ))}
      {mine >= limit && (
        <>
          <li className="board-gap" aria-hidden="true">⋯</li>
          <Row r={rows[mine]} rank={rankOf(rows[mine])} top={top} me youLabel={youLabel} />
        </>
      )}
    </ol>
  );
}

function Row({ r, rank, top, me, youLabel }: { r: LeaderRow; rank: number; top: number; me: boolean; youLabel: string }) {
  return (
    <li className={`board-row${rank === 1 ? ' first' : ''}${me ? ' me' : ''}`}>
      <span className="rank">{rank}</span>
      <div className="bar-wrap">
        <div className="bar-name">{r.name}{me && <span className="you">{youLabel}</span>}</div>
        <div className="bar"><span style={{ width: `${(r.total / top) * 100}%` }} /></div>
      </div>
      <span className="pts">{r.total}</span>
    </li>
  );
}
