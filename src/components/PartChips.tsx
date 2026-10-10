import { PARTS } from '../lib/rubric';

type Props = { on: string[]; onToggle?: (id: string) => void; compact?: boolean };

/** The six rubric parts. Tappable for the teacher, read-only for students. */
export function PartChips({ on, onToggle, compact }: Props) {
  return (
    <div className={`chips${compact ? ' compact' : ''}`}>
      {PARTS.map((p) => {
        const active = on.includes(p.id);
        const body = (
          <>
            <span className="chip-name">{active ? '✓ ' : ''}{p.label}<span className="chip-pts">+2</span></span>
            {!compact && <span className="chip-hint">{p.hint}</span>}
          </>
        );
        return onToggle ? (
          <button key={p.id} type="button" className={`chip${active ? ' on' : ''}`} aria-pressed={active} onClick={() => onToggle(p.id)}>
            {body}
          </button>
        ) : (
          <span key={p.id} className={`chip${active ? ' on' : ' off'}`}>{body}</span>
        );
      })}
    </div>
  );
}
