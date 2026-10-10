import { useState } from 'react';
import type { Lang, Method } from '../lib/methods';
import { STRINGS } from '../lib/i18n';

type Props = { method: Method; lang: Lang; heading?: string; showExample?: boolean; big?: boolean };

/** What a prompting method is, its parts, its template, and an example (hidden behind a button unless showExample). */
export function MethodCard({ method, lang, heading, showExample, big }: Props) {
  const s = STRINGS[lang];
  const [open, setOpen] = useState(Boolean(showExample));
  return (
    <div className={`method-card${big ? ' big' : ''}`} lang={lang}>
      <div className="method-head">
        <span className="eyebrow">{heading ?? s.useMethod}</span>
        <strong className="method-name">{method.name[lang]}</strong>
      </div>
      <p className="method-short">{method.short[lang]}</p>
      <ul className="method-parts">
        {method.parts.map((p) => <li key={p.id}>{p.label[lang]}</li>)}
      </ul>
      <div className="method-box">
        <span className="label">{s.template}</span>
        <p>{method.template[lang]}</p>
      </div>
      {!showExample && (
        <button type="button" className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? s.hideExample : s.seeExample}
        </button>
      )}
      {open && (
        <div className="method-box example">
          <span className="label">{s.example}</span>
          <p>{method.example[lang]}</p>
        </div>
      )}
    </div>
  );
}
