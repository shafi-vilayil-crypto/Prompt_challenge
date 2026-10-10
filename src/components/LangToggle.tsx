import type { Lang } from '../lib/methods';

export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => onChange('en')}>English</button>
      <button type="button" aria-pressed={lang === 'ml'} className={lang === 'ml' ? 'on' : ''} onClick={() => onChange('ml')} lang="ml">മലയാളം</button>
    </div>
  );
}
