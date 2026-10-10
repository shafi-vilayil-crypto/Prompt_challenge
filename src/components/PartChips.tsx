import type { Lang, Method } from '../lib/methods';

type Props = { method: Method; on: string[]; lang?: Lang; onToggle?: (id: string) => void; compact?: boolean };

/** The scoring parts of a method. Tappable for the teacher, read-only for students. */
export function PartChips({ method, on, lang = 'en', onToggle, compact }: Props) {
  return (
    <div className={`chips${compact ? ' compact' : ''}`} lang={lang}>
      {method.parts.map((p) => {
        const active = on.includes(p.id);
        const body = (
          <>
            <span className="chip-name">{active ? '✓ ' : ''}{p.label[lang]}<span className="chip-pts">+2</span></span>
            {!compact && <span className="chip-hint">{p.hint[lang]}</span>}
          </>
        );
        return onToggle ? (
          <button key={p.id} type="button" className={`chip${active ? ' on' : ''}`} aria-pressed={active} title={p.hint[lang]} onClick={() => onToggle(p.id)}>
            {body}
          </button>
        ) : (
          <span key={p.id} className={`chip${active ? ' on' : ' off'}`} title={p.hint[lang]}>{body}</span>
        );
      })}
    </div>
  );
}
