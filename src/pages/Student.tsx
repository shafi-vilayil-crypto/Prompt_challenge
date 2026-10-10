import { useEffect, useState } from 'react';
import { friendly, latestRound, leaderboard, supabase, type LeaderRow, type Round, type Submission } from '../lib/supabase';
import { syncClock, useSecondsLeft } from '../lib/clock';
import { usePoll } from '../lib/usePoll';
import { loadPlayer, savePlayer, type Player } from '../lib/player';
import { MAX_SCORE, verdict } from '../lib/rubric';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { PartChips } from '../components/PartChips';

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
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [editingName, setEditingName] = useState(false);

  if (!player || editingName) {
    return (
      <NameForm
        initial={player?.name ?? ''}
        onDone={(n) => { setPlayer(savePlayer(n)); setEditingName(false); }}
      />
    );
  }
  return <Game player={player} onChangeName={() => setEditingName(true)} />;
}

function NameForm({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <main className="page narrow">
      <Brand />
      <form
        className="card stack"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name); }}
      >
        <h2>What's your name?</h2>
        <p className="muted">Your name shows on the leaderboard. Use your real name so your teacher knows it's you.</p>
        <input
          id="player-name"
          className="input big"
          value={name}
          maxLength={40}
          autoFocus
          autoComplete="given-name"
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary big" type="submit" disabled={!name.trim()}>Join the game</button>
      </form>
    </main>
  );
}

function Game({ player, onChangeName }: { player: Player; onChangeName: () => void }) {
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
        <button className="link" type="button" onClick={onChangeName}>{player.name} · change</button>
      </Brand>
      {offline && <p className="banner">Can't reach the game. Check your internet; it will reconnect by itself.</p>}
      {!loaded ? (
        <div className="card"><p className="muted">Loading…</p></div>
      ) : !round ? (
        <Waiting text="Waiting for your teacher to start the first round." />
      ) : round.published ? (
        <Results round={round} mine={mine} board={board} player={player} />
      ) : (
        <Play key={round.id} round={round} player={player} />
      )}
    </main>
  );
}

function Play({ round, player }: { round: Round; player: Player }) {
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
    if (!error || error.code === '23505') {
      rememberSent(round.id, error ? sent ?? prompt : prompt);
      setSent(error ? sent ?? prompt : prompt);
      if (error) setError('You already sent a prompt this round.');
      return;
    }
    if (error.code === '42501') setError("Time's up. This round is closed.");
    else setError(friendly(error));
  }

  return (
    <section className="card stack">
      <div className="row between">
        <span className="eyebrow">Challenge</span>
        <Timer endsAt={round.ends_at} />
      </div>
      <h2 className="question">{round.question}</h2>

      {sent !== null ? (
        <div className="stack">
          <p className="success">Sent! Wait for your teacher to score the prompts.</p>
          <blockquote className="quote">{sent}</blockquote>
        </div>
      ) : left === 0 ? (
        <p className="muted">Time's up. Wait for the scores.</p>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="label" htmlFor="prompt-text">Write your prompt</label>
          <textarea
            id="prompt-text"
            className="input"
            rows={6}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write the prompt you would give to the AI…"
          />
          <div className="row between">
            <span className="muted small">You can send only once. Read it before you send.</span>
            <span className="muted small">{text.length}/1000</span>
          </div>
          <button className="btn primary big" type="submit" disabled={!text.trim() || busy}>
            {busy ? 'Sending…' : 'Send my prompt'}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Results({ round, mine, board, player }: { round: Round; mine: Submission | null; board: LeaderRow[]; player: Player }) {
  return (
    <>
      <section className="card stack">
        <span className="eyebrow">Results</span>
        <h2 className="question">{round.question}</h2>
        {mine && mine.score !== null ? (
          <div className="stack">
            <div className="score-line">
              <span className="score-big">{mine.score}</span>
              <span className="muted">/ {MAX_SCORE}</span>
              <span className="verdict">{verdict(mine.score)}</span>
            </div>
            <PartChips on={mine.parts} compact />
            {mine.bonus > 0 && <p className="success">+{mine.bonus} creativity bonus from your teacher</p>}
            <blockquote className="quote">{mine.prompt}</blockquote>
          </div>
        ) : (
          <p className="muted">You didn't send a prompt this round. Join the next one!</p>
        )}
      </section>
      <section className="card stack">
        <h2>Leaderboard</h2>
        <Leaderboard rows={board} highlight={player.id} />
      </section>
      <Waiting text="Wait for the next round. This page updates by itself." small />
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
