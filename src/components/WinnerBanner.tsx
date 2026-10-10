import { useEffect, useRef } from 'react';

type Props = { title: string; subtitle: string; name: string; points: string; closeLabel: string; onClose: () => void };

/** "You're #1!" banner shown over the results with the confetti. */
export function WinnerBanner({ title, subtitle, name, points, closeLabel, onClose }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <div className="winner-overlay" role="dialog" aria-modal="true" aria-labelledby="winner-title" onClick={onClose}>
      <div className="winner-card" onClick={(e) => e.stopPropagation()}>
        <svg className="trophy" viewBox="0 0 64 64" width="88" height="88" aria-hidden="true">
          <path d="M18 8h28v10a14 14 0 0 1-28 0z" fill="#ffd45c" />
          <path d="M18 12H9a9 9 0 0 0 11 13M46 12h9a9 9 0 0 1-11 13" fill="none" stroke="#ffd45c" strokeWidth="4" strokeLinecap="round" />
          <path d="M28 31h8v9h-8z" fill="#e8b93a" />
          <rect x="20" y="40" width="24" height="6" rx="2" fill="#ffd45c" />
          <rect x="16" y="46" width="32" height="8" rx="3" fill="#e8b93a" />
          <path d="M32 13l2.4 4.9 5.4.8-3.9 3.8.9 5.3L32 25.3l-4.8 2.5.9-5.3-3.9-3.8 5.4-.8z" fill="#fff6d6" />
        </svg>
        <h2 id="winner-title" className="winner-title">{title}</h2>
        <p className="winner-sub">{subtitle}</p>
        <p className="winner-name">{name} · {points}</p>
        <button ref={btn} type="button" className="btn primary big" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}
