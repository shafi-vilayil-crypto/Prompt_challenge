import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Session } from '@supabase/supabase-js';
import {
  friendly, latestRound, leaderboard, supabase,
  type LeaderRow, type Question, type Round, type Submission,
} from '../lib/supabase';
import { syncClock, useSecondsLeft } from '../lib/clock';
import { usePoll } from '../lib/usePoll';
import { DEFAULT_METHOD, MAX_BONUS, METHODS, autoParts, getMethod, maxScore, scoreOf, type Lang, type Method } from '../lib/methods';
import { STRINGS, useLang } from '../lib/i18n';
import { estimateTokens } from '../lib/tokens';
import { MethodCard } from '../components/MethodCard';
import { LangToggle } from '../components/LangToggle';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { PartChips } from '../components/PartChips';
import { Brand } from './Student';

type Tab = 'run' | 'screen' | 'questions';
type Marks = Record<string, { parts: string[]; bonus: number }>;

const DURATIONS = [60, 120, 180, 300];

export default function Teacher() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsTeacher(null);
    if (!session) return;
    supabase.rpc('is_teacher').then(({ data }) => setIsTeacher(Boolean(data)));
  }, [session]);

  if (!ready) return <main className="page narrow"><p className="muted">Loading…</p></main>;
  if (!session) return <Login />;
  if (isTeacher === null) return <main className="page narrow"><p className="muted">Checking your account…</p></main>;
  if (!isTeacher) {
    return (
      <main className="page narrow">
        <Brand />
        <div className="card stack">
          <h2>This account can't run the game</h2>
          <p className="muted">
            {session.user.email} isn't in the <code>teachers</code> table. In Supabase, open SQL Editor and run:
          </p>
          <pre className="code">insert into teachers (email) values ('{session.user.email}');</pre>
          <button className="btn" type="button" onClick={() => supabase.auth.signOut()}>Log out</button>
        </div>
      </main>
    );
  }
  return <Console />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="page narrow">
      <Brand />
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : friendly(error));
        }}
      >
        <h2>Teacher login</h2>
        <label className="label" htmlFor="t-email">Email</label>
        <input id="t-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label" htmlFor="t-pass">Password</label>
        <input id="t-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}

function Console() {
  const [tab, setTab] = useState<Tab>('run');
  const [round, setRound] = useState<Round | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => { syncClock(); }, []);

  const refresh = async () => {
    try {
      const r = await latestRound();
      setRound(r);
      const [s, b] = await Promise.all([
        r ? supabase.from('submissions').select('*').eq('round_id', r.id).order('created_at') : Promise.resolve({ data: [], error: null }),
        leaderboard(200),
      ]);
      if (s.error) throw s.error;
      setSubs((s.data ?? []) as Submission[]);
      setBoard(b);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };
  usePoll(refresh, 2000);

  return (
    <main className={`page${tab === 'screen' ? ' screen-page' : ''}`}>
      <Brand>
        <nav className="tabs" aria-label="Teacher sections">
          {(['run', 'screen', 'questions'] as Tab[]).map((t) => (
            <button key={t} type="button" className={`tab${tab === t ? ' active' : ''}`} aria-current={tab === t} onClick={() => setTab(t)}>
              {t === 'run' ? 'Run the game' : t === 'screen' ? 'Projector' : 'Questions'}
            </button>
          ))}
          <button className="tab" type="button" onClick={() => supabase.auth.signOut()}>Log out</button>
        </nav>
      </Brand>
      {offline && <p className="banner">Can't reach Supabase. Check the internet; it retries every 2 seconds.</p>}
      {tab === 'run' && <Run round={round} subs={subs} board={board} refresh={refresh} />}
      {tab === 'screen' && <Projector round={round} subs={subs} board={board} />}
      {tab === 'questions' && <Questions />}
    </main>
  );
}

// ───────────── Run the game ─────────────

function Run({ round, subs, board, refresh }: { round: Round | null; subs: Submission[]; board: LeaderRow[]; refresh: () => Promise<void> }) {
  const left = useSecondsLeft(round?.ends_at);
  const open = Boolean(round && !round.published && left > 0);

  return (
    <div className="grid-2">
      <div className="stack">
        {round && (
          <section className="card stack">
            <div className="row between">
              <span className="eyebrow">{round.published ? 'Scores published' : open ? 'Round open' : 'Round closed, ready to score'}</span>
              {!round.published && <Timer endsAt={round.ends_at} />}
            </div>
            <h2 className="question">{round.question}</h2>
            <p className="muted">Method: <strong>{getMethod(round.method).name.en}</strong> · {subs.length} {subs.length === 1 ? 'prompt' : 'prompts'} received</p>
            {open && <RoundButtons round={round} refresh={refresh} />}
          </section>
        )}
        {round && (round.published || !open || subs.length > 0) && (
          <Scoring key={round.id} round={round} subs={subs} refresh={refresh} />
        )}
        <StartRound open={open} refresh={refresh} />
      </div>
      <div className="stack">
        <section className="card stack">
          <h2>Leaderboard</h2>
          <Leaderboard rows={board} limit={50} />
        </section>
        <ClearAll refresh={refresh} />
      </div>
    </div>
  );
}

function RoundButtons({ round, refresh }: { round: Round; refresh: () => Promise<void> }) {
  const [error, setError] = useState('');
  const call = async (fn: string, args: Record<string, unknown>) => {
    setError('');
    const { error } = await supabase.rpc(fn, args);
    if (error) setError(friendly(error));
    await refresh();
  };
  return (
    <>
      <div className="row wrap">
        <button className="btn" type="button" onClick={() => call('add_time', { p_round: round.id, p_seconds: 30 })}>+30 seconds</button>
        <button className="btn" type="button" onClick={() => call('end_round', { p_round: round.id })}>End now</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

function StartRound({ open, refresh }: { open: boolean; refresh: () => Promise<void> }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [picked, setPicked] = useState('');
  const [seconds, setSeconds] = useState(120);
  const [methodId, setMethodId] = useState(DEFAULT_METHOD);
  const [preview, setPreview] = useState<Lang>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    supabase.from('questions').select('*').order('created_at').then(({ data, error }) => {
      if (error) setError(friendly(error));
      setQuestions((data ?? []) as Question[]);
    });
  }, []);

  async function start() {
    if (open && !confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return; }
    setConfirming(false);
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('start_round', { p_question: picked, p_seconds: seconds, p_method: methodId });
    setBusy(false);
    if (error && (error.code === 'PGRST202' || /p_method/.test(error.message))) {
      setError('The database needs the methods update. In Supabase SQL Editor, run supabase/002_methods.sql, then try again.');
    } else if (error) setError(friendly(error));
    else setPicked('');
    await refresh();
  }

  return (
    <section className="card stack">
      <h2>Start a new round</h2>
      {questions.length === 0 && <p className="muted">No questions yet. Add some in the Questions tab, or type one below.</p>}
      <div className="question-picks" role="radiogroup" aria-label="Question">
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            role="radio"
            aria-checked={picked === q.text}
            className={`pick${picked === q.text ? ' on' : ''}`}
            onClick={() => setPicked(q.text)}
          >
            {q.text}
          </button>
        ))}
      </div>
      <label className="label" htmlFor="custom-q">Or type a question</label>
      <input id="custom-q" className="input" value={picked} maxLength={300} onChange={(e) => setPicked(e.target.value)} placeholder="Ask AI to…" />
      <span className="label">Prompting method</span>
      <div className="method-picks" role="radiogroup" aria-label="Prompting method">
        {METHODS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={methodId === m.id} className={`pill${methodId === m.id ? ' on' : ''}`} onClick={() => setMethodId(m.id)}>
            {m.name.en}
          </button>
        ))}
      </div>
      <div className="row between wrap">
        <span className="muted small">Students see this card under the question.</span>
        <LangToggle lang={preview} onChange={setPreview} />
      </div>
      <MethodCard method={getMethod(methodId)} lang={preview} heading="Method" showExample />
      <span className="label">Time</span>
      <div className="row wrap">
        {DURATIONS.map((s) => (
          <button key={s} type="button" className={`pill${seconds === s ? ' on' : ''}`} aria-pressed={seconds === s} onClick={() => setSeconds(s)}>
            {s / 60} min
          </button>
        ))}
      </div>
      <button className="btn primary big" type="button" disabled={busy || picked.trim().length < 3} onClick={start}>
        {busy ? 'Starting…' : confirming ? 'Tap again: this closes the open round' : 'Start round'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Scoring({ round, subs, refresh }: { round: Round; subs: Submission[]; refresh: () => Promise<void> }) {
  const method = getMethod(round.method);
  const max = maxScore(method);
  const firstScore = (s: Submission) => s.score ?? scoreOf(method, autoParts(method, s.prompt), 0);
  const [marks, setMarks] = useState<Marks>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // First time a prompt is seen: published rounds keep their saved marks, new ones get the auto-score.
  useEffect(() => {
    setMarks((m) => {
      let changed = false;
      const next = { ...m };
      for (const s of subs) {
        if (!next[s.id]) {
          next[s.id] = s.score !== null ? { parts: s.parts, bonus: s.bonus } : { parts: autoParts(method, s.prompt), bonus: 0 };
          changed = true;
        }
      }
      return changed ? next : m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs]);

  // Best first, by the saved or auto score. Re-sorted only when prompts arrive, so cards don't jump while the teacher taps.
  const ordered = useMemo(
    () => [...subs].sort((a, b) => firstScore(b) - firstScore(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subs.length, round.published],
  );

  const update = (id: string, fn: (m: { parts: string[]; bonus: number }) => { parts: string[]; bonus: number }) => {
    setMarks((m) => ({ ...m, [id]: fn(m[id] ?? { parts: [], bonus: 0 }) }));
    setDirty(true);
    setSaved(false);
  };

  async function publish() {
    setBusy(true);
    setError('');
    const payload = subs.map((s) => ({ id: s.id, parts: marks[s.id]?.parts ?? [], bonus: marks[s.id]?.bonus ?? 0 }));
    const { error } = await supabase.rpc('publish_round', { p_round: round.id, p_scores: payload });
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    setSaved(true);
    setDirty(false);
    await refresh();
  }

  if (!subs.length) return <section className="card"><p className="muted">No prompts yet.</p></section>;

  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>Score the prompts</h2>
        <span className="muted small">{method.name.en} · auto-scored. Tap a part to change it.</span>
      </div>
      <ul className="sub-list">
        {ordered.map((s) => {
          const m = marks[s.id] ?? { parts: [], bonus: 0 };
          return (
            <li key={s.id} className="sub">
              <div className="row between">
                <strong className="sub-name">{s.name}</strong>
                <span className="sub-score">{scoreOf(method, m.parts, m.bonus)}<span className="muted small"> / {max}</span></span>
              </div>
              <blockquote className="quote">{s.prompt}</blockquote>
              <span className="muted small">≈ {estimateTokens(s.prompt)} tokens</span>
              <PartChips
                method={method}
                on={m.parts}
                compact
                onToggle={(id) => update(s.id, (x) => ({ ...x, parts: x.parts.includes(id) ? x.parts.filter((p) => p !== id) : [...x.parts, id] }))}
              />
              <div className="row wrap">
                <span className="muted small">Creativity bonus</span>
                {Array.from({ length: MAX_BONUS + 1 }, (_, b) => (
                  <button key={b} type="button" className={`pill small${m.bonus === b ? ' on' : ''}`} aria-pressed={m.bonus === b} onClick={() => update(s.id, (x) => ({ ...x, bonus: b }))}>
                    {b === 0 ? 'None' : `+${b}`}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <button className="btn primary big" type="button" disabled={busy || (round.published && !dirty)} onClick={publish}>
        {busy ? 'Publishing…' : round.published ? (dirty ? 'Update published scores' : 'Scores published') : 'Publish scores to everyone'}
      </button>
      {!round.published && <p className="muted small">Publishing also closes the round, so late prompts can't come in.</p>}
      {saved && <p className="success">Scores published. Students see them now.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function ClearAll({ refresh }: { refresh: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return (
    <section className="card stack">
      <h2>New class</h2>
      <p className="muted small">Deletes every round, prompt and score. Questions stay.</p>
      <button
        type="button"
        className="btn danger"
        onClick={async () => {
          if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
          clearTimeout(timer.current);
          setArmed(false);
          const { error } = await supabase.from('rounds').delete().not('id', 'is', null);
          setError(error ? friendly(error) : '');
          await refresh();
        }}
      >
        {armed ? 'Tap again to delete everything' : 'Clear all rounds and scores'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

// ───────────── Projector ─────────────

function Projector({ round, subs, board }: { round: Round | null; subs: Submission[]; board: LeaderRow[] }) {
  const [lang, setLang] = useLang();
  const t = STRINGS[lang];
  const method: Method | null = round ? getMethod(round.method) : null;
  const url = window.location.origin + '/';
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#1d3a31', light: '#f4f1e6' } }).then(setQr).catch(() => setQr(''));
  }, [url]);

  const top3 = round?.published
    ? [...subs].filter((s) => s.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
    : [];

  return (
    <div className="projector">
      <section className="proj-join">
        {qr && <img className="qr" src={qr} alt={`QR code for ${url}`} />}
        <p className="proj-url">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
        <p className="muted">{t.scanJoin}</p>
        <div className="row wrap center">
          <LangToggle lang={lang} onChange={setLang} />
          <button className="btn" type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Full screen</button>
        </div>
      </section>

      <section className="proj-main">
        {!round ? (
          <h1 className="proj-q">{t.getReady}</h1>
        ) : (
          <>
            <span className="eyebrow">{round.published ? t.results : t.challenge}</span>
            <h1 className="proj-q">{round.question}</h1>
            {!round.published && (
              <div className="row wrap proj-status">
                <Timer endsAt={round.ends_at} big doneLabel={t.timesUp} />
                <span className="proj-count">{t.promptsSent(subs.length)}</span>
              </div>
            )}
            {!round.published && method && <MethodCard method={method} lang={lang} big />}
            {top3.length > 0 && (
              <div className="stack">
                <span className="eyebrow">{t.bestPrompts}</span>
                <ol className="top-prompts">
                  {top3.map((s) => (
                    <li key={s.id}>
                      <div className="row between"><strong>{s.name}</strong><span className="sub-score">{s.score}</span></div>
                      <blockquote className="quote">{s.prompt}</blockquote>
                      <span className="muted small">{t.tokens(estimateTokens(s.prompt))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
        <div className="stack">
          <span className="eyebrow">{t.leaderboard}</span>
          <Leaderboard rows={board} limit={8} big emptyText={t.boardEmpty} youLabel={t.you} />
        </div>
      </section>
    </div>
  );
}

// ───────────── Questions ─────────────

function Questions() {
  const [list, setList] = useState<Question[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('questions').select('*').order('created_at');
    if (error) setError(friendly(error));
    setList((data ?? []) as Question[]);
  };
  useEffect(() => { load(); }, []);

  return (
    <section className="card stack narrow-card">
      <h2>Question bank</h2>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim().length < 3) return;
          const { error } = await supabase.from('questions').insert({ text: text.trim() });
          if (error) { setError(friendly(error)); return; }
          setText('');
          setError('');
          load();
        }}
      >
        <input id="new-q" className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Ask AI to…" />
        <button className="btn primary" type="submit" disabled={text.trim().length < 3}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="q-list">
        {list.map((q) => (
          <li key={q.id} className="row between">
            <span>{q.text}</span>
            <button
              className="btn small"
              type="button"
              onClick={async () => {
                const { error } = await supabase.from('questions').delete().eq('id', q.id);
                if (error) setError(friendly(error));
                load();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
