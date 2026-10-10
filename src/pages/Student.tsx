import { useEffect, useState } from 'react';
import { friendly, latestRound, leaderboard, supabase, type LeaderRow, type Round, type Submission } from '../lib/supabase';
import { syncClock, useSecondsLeft } from '../lib/clock';
import { usePoll } from '../lib/usePoll';
import { loadPlayer, savePlayer, type Player } from '../lib/player';
import { getMethod, type Lang } from '../lib/methods';
import { STRINGS, useLang } from '../lib/i18n';
import { estimateTokens } from '../lib/tokens';
import { Leaderboard } from '../components/Leaderboard';
import { PartChips } from '../components/PartChips';
import { MethodCard } from '../components/MethodCard';
import { LangToggle } from '../components/LangToggle';
import { RainBackground } from '../components/RainBackground';
import { TimerRing } from '../components/TimerRing';
import { Podium } from '../components/Podium';
import { Confetti } from '../components/Confetti';
import { WinnerBanner } from '../components/WinnerBanner';

const SENT_KEY = 'prompt-challenge.sent'; // { [roundId]: promptText }
const CELEBRATED_KEY = 'prompt-challenge.celebrated'; // round ids where the #1 banner was already shown

function loadSent(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch { return {}; }
}
function rememberSent(roundId: string, text: string) {
  const all = loadSent();
  all[roundId] = text;
  try { localStorage.setItem(SENT_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
function alreadyCelebrated(roundId: string) {
  try { return (JSON.parse(localStorage.getItem(CELEBRATED_KEY) || '[]') as string[]).includes(roundId); } catch { return false; }
}
function markCelebrated(roundId: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(CELEBRATED_KEY) || '[]') as string[]).filter((id) => id !== roundId);
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...list.slice(-20), roundId]));
  } catch { /* ignore */ }
}

export default function Student() {
  const [lang, setLang] = useLang();
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [editingName, setEditingName] = useState(false);

  return (
    <>
      <RainBackground />
      {!player || editingName ? (
        <NameForm
          lang={lang}
          setLang={setLang}
          initial={player?.name ?? ''}
          onDone={(n) => { setPlayer(savePlayer(n)); setEditingName(false); }}
        />
      ) : (
        <Game lang={lang} setLang={setLang} player={player} onChangeName={() => setEditingName(true)} />
      )}
    </>
  );
}

function NameForm({ lang, setLang, initial, onDone }: { lang: Lang; setLang: (l: Lang) => void; initial: string; onDone: (name: string) => void }) {
  const s = STRINGS[lang];
  const [name, setName] = useState(initial);
  return (
    <main className="page narrow student">
      <Brand><LangToggle lang={lang} onChange={setLang} /></Brand>
      <form className="card stack hero-card enter" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name); }}>
        <div className="bounce-drop" aria-hidden="true" />
        <h2 className="hero-title">{s.whatsName}</h2>
        <p className="muted">{s.nameHelp}</p>
        <input
          id="player-name"
          className="input big"
          value={name}
          maxLength={40}
          autoFocus
          autoComplete="given-name"
          placeholder={s.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary big" type="submit" disabled={!name.trim()}>{s.join}</button>
      </form>
    </main>
  );
}

function Game({ lang, setLang, player, onChangeName }: { lang: Lang; setLang: (l: Lang) => void; player: Player; onChangeName: () => void }) {
  const s = STRINGS[lang];
  const [round, setRound] = useState<Round | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [mine, setMine] = useState<Submission | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => { syncClock(); }, []);

  usePoll(async () => {
    try {
      const r = await latestRound();
      setRound(r);
      setOffline(false);
      if (r?.published) {
        const [rows, own] = await Promise.all([
          leaderboard(200),
          supabase.from('submissions').select('*').eq('round_id', r.id).eq('player_id', player.id).maybeSingle(),
        ]);
        setBoard(rows);
        setMine((own.data as Submission | null) ?? null);
      }
    } catch {
      setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, 3000, [player.id]);

  return (
    <main className="page narrow student">
      <Brand>
        <div className="row wrap">
          <button className="player-chip" type="button" onClick={onChangeName} title={s.change}>
            <span className="player-avatar" aria-hidden="true">{player.name.trim().charAt(0).toUpperCase() || '?'}</span>
            <span className="player-name">{player.name}</span>
          </button>
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </Brand>
      {offline && <p className="banner">{s.offline}</p>}
      {!loaded ? (
        <div className="card"><p className="muted">{s.loading}</p></div>
      ) : !round ? (
        <Waiting title={s.welcome(player.name)} text={s.waitFirst} />
      ) : round.published ? (
        <Results key={round.id} lang={lang} round={round} mine={mine} board={board} player={player} />
      ) : (
        <Play key={round.id} lang={lang} round={round} player={player} />
      )}
    </main>
  );
}

function Play({ lang, round, player }: { lang: Lang; round: Round; player: Player }) {
  const s = STRINGS[lang];
  const method = getMethod(round.method);
  const left = useSecondsLeft(round.ends_at);
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(() => loadSent()[round.id] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tokens = estimateTokens(text);

  async function submit() {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('submissions').insert({
      round_id: round.id, player_id: player.id, name: player.name, prompt,
    });
    setBusy(false);
    if (!error) { rememberSent(round.id, prompt); setSent(prompt); return; }
    if (error.code === '23505') { rememberSent(round.id, prompt); setSent(prompt); setError(s.alreadySent); return; }
    setError(error.code === '42501' ? s.closed : friendly(error));
  }

  return (
    <>
      <section className="card question-card enter">
        <div className="question-head">
          <div className="stack tight">
            <span className="eyebrow">{s.challenge}</span>
            <span className="method-pill">{method.name[lang]}</span>
          </div>
          <TimerRing startedAt={round.started_at} endsAt={round.ends_at} doneLabel={s.timesUp} />
        </div>
        <h2 className="question">{round.question}</h2>
      </section>

      {sent !== null ? (
        <section className="card stack sent-card enter">
          <div className="sent-check" aria-hidden="true">
            <svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
          </div>
          <h2 className="hero-title">{s.sentTitle}</h2>
          <p className="muted">{s.sent}</p>
          <blockquote className="quote">{sent}</blockquote>
          <span className="token-count">{s.tokens(estimateTokens(sent))}</span>
        </section>
      ) : left === 0 ? (
        <Waiting text={s.timeUpWait} />
      ) : (
        <form className="card stack compose-card enter" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="label" htmlFor="prompt-text">{s.writePrompt}</label>
          <textarea
            id="prompt-text"
            className="input"
            rows={6}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={s.placeholder}
          />
          <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (text.length / 1000) * 100)}%` }} /></div>
          <div className="row between wrap">
            <span className="token-count" title={s.tokensHelp}>{s.tokens(tokens)}</span>
            <span className="muted small">{text.length}/1000</span>
          </div>
          <span className="muted small">{s.onceOnly}</span>
          <button className="btn primary big send-btn" type="submit" disabled={!text.trim() || busy}>
            {busy ? s.sending : s.send}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
      {sent !== null && error && <p className="error" role="alert">{error}</p>}

      <details className="card how-card enter" open={sent === null}>
        <summary>{s.howToWrite(method.name[lang])}</summary>
        <MethodCard method={method} lang={lang} />
      </details>
    </>
  );
}

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return v;
}

function Results({ lang, round, mine, board, player }: { lang: Lang; round: Round; mine: Submission | null; board: LeaderRow[]; player: Player }) {
  const s = STRINGS[lang];
  const method = getMethod(round.method);
  const partsMax = method.parts.length * 2;
  const scored = Boolean(mine && mine.score !== null);
  const partsPts = scored && mine ? mine.score! - mine.bonus : 0;
  const shown = useCountUp(partsPts);
  const me = board.find((r) => r.player_id === player.id);
  const rank = me ? 1 + board.filter((r) => r.total > me.total).length : 0;
  const isFirst = rank === 1 && (me?.total ?? 0) > 0;
  const [celebrate, setCelebrate] = useState(false);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (isFirst && !alreadyCelebrated(round.id)) {
      markCelebrated(round.id);
      setCelebrate(true);
      setConfetti(true);
    }
  }, [isFirst, round.id]);

  const R = 52;
  const C = 2 * Math.PI * R;
  const frac = partsMax ? Math.min(1, shown / partsMax) : 0;

  return (
    <>
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      {celebrate && me && (
        <WinnerBanner
          title={s.youreFirst}
          subtitle={s.topOfBoard}
          name={player.name}
          points={s.totalPoints(me.total)}
          closeLabel={s.close}
          onClose={() => setCelebrate(false)}
        />
      )}

      <section className={`card result-card enter${isFirst ? ' winner' : ''}`}>
        <div className="row between wrap">
          <span className="eyebrow">{s.results}</span>
          <span className="method-pill">{method.name[lang]}</span>
        </div>
        <h2 className="question small-q">{round.question}</h2>

        {scored && mine ? (
          <div className="stack">
            <div className="score-hero">
              <div className="score-ring" aria-label={`${partsPts} / ${partsMax}`}>
                <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
                  <circle cx="60" cy="60" r={R} className="ring-track" />
                  <circle cx="60" cy="60" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
                </svg>
                <span className="score-ring-text"><b>{shown}</b><small>/ {partsMax}</small></span>
              </div>
              <div className="stack tight">
                <span className="label">{s.roundScore}</span>
                <span className="verdict big-verdict">{s.verdict(partsPts, partsMax)}</span>
                {mine.bonus > 0 && <span className="bonus-line">{s.bonusTotal(mine.bonus, mine.score!)}</span>}
                {rank > 0 && <span className={`rank-pill${rank <= 3 ? ' top' : ''}`}>{s.rankLine(rank, board.length)}</span>}
              </div>
            </div>
            <span className="label">{s.partsLabel}</span>
            <PartChips method={method} on={mine.parts} lang={lang} compact />
            {mine.feedback && (
              <div className="feedback-box">
                <span className="label">{s.feedback}</span>
                <p>{mine.feedback}</p>
              </div>
            )}
            <blockquote className="quote">{mine.prompt}</blockquote>
            <span className="muted small">{s.tokens(estimateTokens(mine.prompt))}</span>
          </div>
        ) : (
          <p className="muted">{s.missed}</p>
        )}
      </section>

      <section className="card stack enter">
        <h2>{s.leaderboard}</h2>
        {board.length ? (
          <>
            <Podium rows={board} highlight={player.id} youLabel={s.you} />
            {board.length > 3 && <Leaderboard rows={board} highlight={player.id} emptyText={s.boardEmpty} youLabel={s.you} skip={3} limit={13} />}
          </>
        ) : (
          <p className="muted">{s.boardEmpty}</p>
        )}
      </section>
      <Waiting text={s.waitNext} small />
    </>
  );
}

function Waiting({ title, text, small }: { title?: string; text: string; small?: boolean }) {
  return (
    <div className={`card waiting enter${small ? ' small' : ''}`}>
      {small ? <span className="pulse" aria-hidden="true" /> : <div className="bounce-drop" aria-hidden="true" />}
      <div className="stack tight">
        {title && <h2 className="hero-title">{title}</h2>}
        <p>{text}</p>
      </div>
    </div>
  );
}

export function Brand({ children }: { children?: React.ReactNode }) {
  return (
    <header className="brand-bar">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={30} height={36} />
        <span>Prompt Challenge</span>
      </div>
      {children}
    </header>
  );
}
