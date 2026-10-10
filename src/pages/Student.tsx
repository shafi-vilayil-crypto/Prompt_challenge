import { useEffect, useState } from 'react';
import { friendly, latestRound, leaderboard, supabase, type LeaderRow, type Round, type Submission } from '../lib/supabase';
import { syncClock, useSecondsLeft } from '../lib/clock';
import { usePoll } from '../lib/usePoll';
import { loadPlayer, savePlayer, type Player } from '../lib/player';
import { getMethod, maxScore, type Lang } from '../lib/methods';
import { STRINGS, useLang } from '../lib/i18n';
import { estimateTokens } from '../lib/tokens';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { PartChips } from '../components/PartChips';
import { MethodCard } from '../components/MethodCard';
import { LangToggle } from '../components/LangToggle';

const SENT_KEY = 'prompt-challenge.sent'; // { [roundId]: promptText }

function loadSent(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch { return {}; }
}
function rememberSent(roundId: string, text: string) {
  const all = loadSent();
  all[roundId] = text;
  try { localStorage.setItem(SENT_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

export default function Student() {
  const [lang, setLang] = useLang();
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [editingName, setEditingName] = useState(false);

  if (!player || editingName) {
    return (
      <NameForm
        lang={lang}
        setLang={setLang}
        initial={player?.name ?? ''}
        onDone={(n) => { setPlayer(savePlayer(n)); setEditingName(false); }}
      />
    );
  }
  return <Game lang={lang} setLang={setLang} player={player} onChangeName={() => setEditingName(true)} />;
}

function NameForm({ lang, setLang, initial, onDone }: { lang: Lang; setLang: (l: Lang) => void; initial: string; onDone: (name: string) => void }) {
  const s = STRINGS[lang];
  const [name, setName] = useState(initial);
  return (
    <main className="page narrow">
      <Brand><LangToggle lang={lang} onChange={setLang} /></Brand>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name); }}>
        <h2>{s.whatsName}</h2>
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
    <main className="page narrow">
      <Brand>
        <div className="row wrap">
          <button className="link" type="button" onClick={onChangeName}>{player.name} · {s.change}</button>
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </Brand>
      {offline && <p className="banner">{s.offline}</p>}
      {!loaded ? (
        <div className="card"><p className="muted">{s.loading}</p></div>
      ) : !round ? (
        <Waiting text={s.waitFirst} />
      ) : round.published ? (
        <Results lang={lang} round={round} mine={mine} board={board} player={player} />
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
      <section className="card stack">
        <div className="row between">
          <span className="eyebrow">{s.challenge}</span>
          <Timer endsAt={round.ends_at} doneLabel={s.timesUp} />
        </div>
        <h2 className="question">{round.question}</h2>

        {sent !== null ? (
          <div className="stack">
            <p className="success">{s.sent}</p>
            <blockquote className="quote">{sent}</blockquote>
            <span className="muted small">{s.tokens(estimateTokens(sent))}</span>
          </div>
        ) : left === 0 ? (
          <p className="muted">{s.timeUpWait}</p>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
            <div className="row between wrap">
              <span className="token-count" title={s.tokensHelp}>{s.tokens(estimateTokens(text))}</span>
              <span className="muted small">{text.length}/1000</span>
            </div>
            <span className="muted small">{s.onceOnly}</span>
            <button className="btn primary big" type="submit" disabled={!text.trim() || busy}>
              {busy ? s.sending : s.send}
            </button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <MethodCard method={method} lang={lang} />
    </>
  );
}

function Results({ lang, round, mine, board, player }: { lang: Lang; round: Round; mine: Submission | null; board: LeaderRow[]; player: Player }) {
  const s = STRINGS[lang];
  const method = getMethod(round.method);
  const max = maxScore(method);
  return (
    <>
      <section className="card stack">
        <div className="row between wrap">
          <span className="eyebrow">{s.results}</span>
          <span className="muted small">{s.method}: {method.name[lang]}</span>
        </div>
        <h2 className="question">{round.question}</h2>
        {mine && mine.score !== null ? (
          <div className="stack">
            <div className="score-line">
              <span className="score-big">{mine.score}</span>
              <span className="muted">/ {max}</span>
              <span className="verdict">{s.verdict(mine.score, max)}</span>
            </div>
            <span className="label">{s.partsLabel}</span>
            <PartChips method={method} on={mine.parts} lang={lang} compact />
            {mine.bonus > 0 && <p className="success">{s.bonus(mine.bonus)}</p>}
            <blockquote className="quote">{mine.prompt}</blockquote>
            <span className="muted small">{s.tokens(estimateTokens(mine.prompt))}</span>
          </div>
        ) : (
          <p className="muted">{s.missed}</p>
        )}
      </section>
      <section className="card stack">
        <h2>{s.leaderboard}</h2>
        <Leaderboard rows={board} highlight={player.id} emptyText={s.boardEmpty} youLabel={s.you} />
      </section>
      <Waiting text={s.waitNext} small />
    </>
  );
}

function Waiting({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={`card waiting${small ? ' small' : ''}`}>
      <span className="pulse" aria-hidden="true" />
      <p>{text}</p>
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
