import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Session } from '@supabase/supabase-js';
import {
  friendly, latestRound, leaderboard, supabase,
  type LeaderRow, type Question, type Round, type Submission,
} from '../lib/supabase';
import { syncClock, useSecondsLeft } from '../lib/clock';
import { usePoll } from '../lib/usePoll';
import { DEFAULT_METHOD, MAX_BONUS, METHODS, autoParts, getMethod, scoreOf, type Lang, type Method } from '../lib/methods';
import { STRINGS, useLang } from '../lib/i18n';
import { estimateTokens } from '../lib/tokens';
import { MethodCard } from '../components/MethodCard';
import { LangToggle } from '../components/LangToggle';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { PartChips } from '../components/PartChips';
import { DEFAULT_MODEL, aiTest, loadAi, saveAi, type AiResult, type AiSettings } from '../lib/ai';
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, claudeTest, loadClaude, saveClaude, type ClaudeSettings } from '../lib/claude';
import { aiReady, scoreWithFallback } from '../lib/scorer';
import {
  MAX_AI_PROMPTS_PER_ROUND, MAX_AUTO_ATTEMPTS, backoffMs,
  loadSavedResults, loadUsage, releaseAiLock, saveResults, takeAiLock, type ClaudeUsage,
} from '../lib/budget';
import { Brand } from './Student';
import { Pager, paginate } from '../components/Pager';
import { SAMPLE_QUESTIONS } from '../lib/sampleQuestions';
import { RainBackground } from '../components/RainBackground';
import { Confetti } from '../components/Confetti';
import { Podium } from '../components/Podium';
import { TimerRing } from '../components/TimerRing';

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

  const left = useSecondsLeft(round?.ends_at);
  const open = Boolean(round && !round.published && left > 0);
  const [ai, setAiState] = useState<AiSettings>(loadAi);
  const setAi = (next: AiSettings) => { saveAi(next); setAiState(next); };
  const [claude, setClaudeState] = useState<ClaudeSettings>(loadClaude);
  const setClaude = (next: ClaudeSettings) => { saveClaude(next); setClaudeState(next); };
  const aiState = useAi(round, subs, open, ai, claude);
  const scoring = useMarks(round, subs, aiState.results);

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
      {tab === 'run' && (
        <Run round={round} subs={subs} board={board} refresh={refresh} open={open} ai={ai} setAi={setAi} claude={claude} setClaude={setClaude} aiState={aiState} scoring={scoring} />
      )}
      {tab === 'screen' && <Projector round={round} subs={subs} board={board} />}
      {tab === 'questions' && <Questions />}
    </main>
  );
}

// ───────────── Scoring state (kept here so it survives switching tabs) ─────────────

const LIVE_EVERY_MS = 10_000;

type AiState = {
  results: Record<string, AiResult>; busy: boolean; error: string; note: string; retryAt: number;
  run: (manual: boolean) => Promise<void>;
};

/**
 * AI scoring for the current round: Gemini first, Claude as the fallback. Runs live while the round is open.
 * Retries are automatic with backoff (1, 2, 4, then 5 minutes after consecutive errors), at most
 * MAX_AUTO_ATTEMPTS per prompt; paid Claude calls are also capped per round and per day (see budget.ts); at most MAX_AI_PROMPTS_PER_ROUND prompts per round go to the AI; results are
 * saved so a reload never re-scores them; only one open teacher tab scores at a time.
 */
function useAi(round: Round | null, subs: Submission[], open: boolean, ai: AiSettings, claude: ClaudeSettings): AiState {
  const [results, setResults] = useState<Record<string, AiResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const attempts = useRef(new Map<string, number>()); // automatic tries per prompt
  const cooldownUntil = useRef(0);
  const failures = useRef(0);
  const [retryAt, setRetryAt] = useState(0);
  const busyRef = useRef(false);
  const latest = useRef({ round, subs, ai, claude, results });
  latest.current = { round, subs, ai, claude, results };
  const roundId = round?.id;

  useEffect(() => {
    setResults(roundId ? loadSavedResults<AiResult>(roundId) : {});
    setError('');
    setNote('');
    attempts.current = new Map();
    cooldownUntil.current = 0;
    failures.current = 0;
    setRetryAt(0);
  }, [roundId]);

  useEffect(() => {
    if (roundId && Object.keys(results).length) saveResults(roundId, results);
  }, [roundId, results]);

  useEffect(() => {
    const release = () => releaseAiLock();
    window.addEventListener('pagehide', release);
    return () => { window.removeEventListener('pagehide', release); releaseAiLock(); };
  }, []);

  const run = useCallback(async (manual: boolean) => {
    const { round, subs, ai, claude, results } = latest.current;
    if (!round || !aiReady(ai, claude) || busyRef.current) return;
    if (!manual && Date.now() < cooldownUntil.current) return;
    if (!takeAiLock()) { setNote('AI scoring is running in another teacher tab or window. Close the others to score here.'); return; }
    setNote('');

    const sentSoFar = attempts.current.size;
    const room = Math.max(0, MAX_AI_PROMPTS_PER_ROUND - sentSoFar);
    let todo = subs.filter((x) => !results[x.id] && (manual || (attempts.current.get(x.id) ?? 0) < MAX_AUTO_ATTEMPTS));
    // The per-round cap counts prompts, so a flood of fake submissions can't run up the bill.
    todo = todo.filter((x) => attempts.current.has(x.id) || todo.indexOf(x) < room);
    if (!todo.length) {
      if (subs.some((x) => !results[x.id]) && room === 0) setNote(`Only the first ${MAX_AI_PROMPTS_PER_ROUND} prompts of a round are scored by AI. The rest keep the word check.`);
      return;
    }
    todo.forEach((x) => attempts.current.set(x.id, (attempts.current.get(x.id) ?? 0) + 1));
    busyRef.current = true;
    setBusy(true);
    setError('');
    const rid = round.id;
    try {
      await scoreWithFallback(ai, claude, rid, getMethod(round.method), round.question, todo.map((x) => ({ id: x.id, prompt: x.prompt })), (res) => {
        if (latest.current.round?.id === rid) setResults((r) => ({ ...r, ...res }));
      });
      failures.current = 0;
      cooldownUntil.current = 0;
      setRetryAt(0);
    } catch (e) {
      setError((e as Error).message);
      failures.current += 1;
      cooldownUntil.current = Date.now() + backoffMs(failures.current);
      setRetryAt(cooldownUntil.current);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Live scoring: every 10 seconds until the scores are published, new or unscored prompts go to the AI in
  // one batch (a few calls a minute however many students). A check with nothing to score sends nothing;
  // after an error the backoff above decides when the next try happens.
  useEffect(() => {
    if (!round || round.published || !aiReady(ai, claude)) return;
    run(false);
    const t = setInterval(() => run(false), LIVE_EVERY_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, open, round?.published, ai.enabled, ai.apiKey, claude.enabled, claude.apiKey]);

  // After the round closes, late prompts are picked up as they appear.
  useEffect(() => {
    if (round && !open && !round.published && aiReady(ai, claude)) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs.length]);

  return { results, busy, error, note, retryAt, run };
}

type Mark = { parts: string[]; bonus: number };
type ScoringState = { marks: Marks; update: (id: string, fn: (m: Mark) => Mark) => void; dirty: boolean; setDirty: (d: boolean) => void };

/** The teacher's marks per prompt: saved marks, else the AI's, else the word check. Hand edits always win. */
function useMarks(round: Round | null, subs: Submission[], aiResults: Record<string, AiResult>): ScoringState {
  const [marks, setMarks] = useState<Marks>({});
  const [dirty, setDirty] = useState(false);
  const touched = useRef(new Set<string>());
  const applied = useRef(new Set<string>());
  const roundId = round?.id;

  useEffect(() => { setMarks({}); setDirty(false); touched.current = new Set(); applied.current = new Set(); }, [roundId]);

  useEffect(() => {
    if (!round) return;
    const method = getMethod(round.method);
    // AI results not applied yet (and not overridden by hand): decided here, outside the state update.
    const fromAi = subs.filter((s) => aiResults[s.id] && !applied.current.has(s.id) && !touched.current.has(s.id));
    fromAi.forEach((s) => applied.current.add(s.id));
    if (fromAi.length) setDirty(true);
    setMarks((m) => {
      let changed = false;
      const next = { ...m };
      for (const s of fromAi) {
        next[s.id] = { parts: aiResults[s.id].parts, bonus: aiResults[s.id].bonus };
        changed = true;
      }
      for (const s of subs) {
        if (!next[s.id]) {
          next[s.id] = s.score !== null ? { parts: s.parts, bonus: s.bonus } : { parts: autoParts(method, s.prompt), bonus: 0 };
          changed = true;
        }
      }
      return changed ? next : m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, aiResults, roundId]);

  const update = (id: string, fn: (m: Mark) => Mark) => {
    touched.current.add(id);
    setMarks((m) => ({ ...m, [id]: fn(m[id] ?? { parts: [], bonus: 0 }) }));
    setDirty(true);
  };

  return { marks, update, dirty, setDirty };
}

// ───────────── Run the game ─────────────

type RunProps = {
  round: Round | null; subs: Submission[]; board: LeaderRow[]; refresh: () => Promise<void>; open: boolean;
  ai: AiSettings; setAi: (s: AiSettings) => void; claude: ClaudeSettings; setClaude: (s: ClaudeSettings) => void;
  aiState: AiState; scoring: ScoringState;
};

function Run({ round, subs, board, refresh, open, ai, setAi, claude, setClaude, aiState, scoring }: RunProps) {

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
          <Scoring key={round.id} round={round} subs={subs} refresh={refresh} open={open} aiOn={aiReady(ai, claude)} aiState={aiState} scoring={scoring} />
        )}
        <StartRound open={open} refresh={refresh} />
      </div>
      <div className="stack">
        <AiSettingsCard ai={ai} setAi={setAi} />
        {ai.enabled && <ClaudeCard claude={claude} setClaude={setClaude} />}
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
  const [search, setSearch] = useState('');
  const [qPage, setQPage] = useState(0);
  const filtered = questions.filter((q) => q.text.toLowerCase().includes(search.trim().toLowerCase()));
  const { pageItems, pages, page } = paginate(filtered, qPage, 6);

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
      {questions.length > 6 && (
        <input
          id="q-search" className="input" type="search" value={search} placeholder={`Search ${questions.length} questions`}
          onChange={(e) => { setSearch(e.target.value); setQPage(0); }}
        />
      )}
      {search && filtered.length === 0 && <p className="muted small">No question matches "{search}".</p>}
      <div className="question-picks" role="radiogroup" aria-label="Question">
        {pageItems.map((q) => (
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
      <Pager page={page} pages={pages} onPage={setQPage} />
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

function Scoring({ round, subs, refresh, open, aiOn, aiState, scoring }: {
  round: Round; subs: Submission[]; refresh: () => Promise<void>; open: boolean; aiOn: boolean; aiState: AiState; scoring: ScoringState;
}) {
  const method = getMethod(round.method);
  const max = method.parts.length * 2;
  const firstScore = (s: Submission) => s.score ?? scoreOf(method, autoParts(method, s.prompt), 0);
  const { marks, update, dirty, setDirty } = scoring;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [armed, setArmed] = useState(false); // second tap needed to publish without AI scores
  const scoredByAi = (s: Submission) => Boolean(aiState.results[s.id] || s.feedback);
  const pending = subs.filter((s) => !scoredByAi(s)).length;

  // Best first, by the saved or auto score. Re-sorted only when prompts arrive, so cards don't jump while the teacher taps.
  const ordered = useMemo(
    () => [...subs].sort((a, b) => firstScore(b) - firstScore(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subs.length, round.published],
  );

  async function publish() {
    setBusy(true);
    setError('');
    setArmed(false);
    const payload = subs.map((s) => ({
      id: s.id,
      parts: marks[s.id]?.parts ?? [],
      bonus: marks[s.id]?.bonus ?? 0,
      comment: aiState.results[s.id]?.comment ?? s.feedback ?? '',
    }));
    const { error } = await supabase.rpc('publish_round', { p_round: round.id, p_scores: payload });
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    setSaved(true);
    setDirty(false);
    await refresh();
  }

  async function endRound() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('end_round', { p_round: round.id });
    setBusy(false);
    if (error) setError(friendly(error));
    await refresh(); // the AI picks up any remaining prompts once the round is closed
  }

  // What the main button does depends on the round and on the AI.
  let action: { label: string; onClick: () => void; disabled?: boolean } ;
  if (round.published) {
    action = { label: dirty ? 'Update published scores' : 'Scores published', onClick: publish, disabled: !dirty };
  } else if (aiOn && open) {
    action = { label: 'End the round now', onClick: endRound };
  } else if (aiOn && aiState.busy) {
    action = { label: `AI is scoring… (${pending} left)`, onClick: () => {}, disabled: true };
  } else if (aiOn && pending > 0) {
    action = armed
      ? { label: `Tap again to publish ${pending} without AI`, onClick: publish }
      : { label: 'Publish scores to everyone', onClick: () => { setArmed(true); setTimeout(() => setArmed(false), 5000); } };
  } else {
    action = { label: 'Publish scores to everyone', onClick: publish };
  }

  if (!subs.length) return <section className="card"><p className="muted">No prompts yet.</p></section>;

  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>Score the prompts</h2>
        <span className="muted small">
          {method.name.en} · {aiOn ? 'AI checks each prompt against the question' : 'word check only (AI scoring is off)'}. Tap a part to change it.
        </span>
      </div>
      {aiOn && (
        <div className="row wrap">
          <button className="btn" type="button" disabled={aiState.busy || pending === 0} onClick={() => aiState.run(true)}>
            {aiState.busy ? 'AI is scoring…' : 'Score with AI'}
          </button>
          <span className="muted small">
            {`${subs.length - pending} of ${subs.length} scored by AI.`}{open ? ' New prompts are scored every 10 seconds.' : ''}
          </span>
        </div>
      )}
      {aiState.error && (
        <p className="error" role="alert">
          {aiState.error} The word check scores are kept.{' '}
          <RetryCountdown at={aiState.retryAt} /> Press "Score with AI" to try now.
        </p>
      )}
      {aiState.note && <p className="muted small" role="status">{aiState.note}</p>}
      {armed && <p className="error" role="alert">{pending} {pending === 1 ? 'prompt has' : 'prompts have'} only the word check, which can't tell if a prompt fits the question. Press "Score with AI" first, or tap again to publish anyway.</p>}
      <ul className="sub-list">
        {ordered.map((s) => {
          const m = marks[s.id] ?? { parts: [], bonus: 0 };
          return (
            <li key={s.id} className="sub">
              <div className="row between">
                <strong className="sub-name">{s.name}</strong>
                <span className="sub-score">{scoreOf(method, m.parts, 0)}<span className="muted small"> / {max}{m.bonus > 0 ? ` +${m.bonus} bonus` : ''}</span></span>
              </div>
              <blockquote className="quote">{s.prompt}</blockquote>
              <span className="muted small">≈ {estimateTokens(s.prompt)} tokens</span>
              {aiState.results[s.id]?.comment || s.feedback ? (
                <p className="ai-comment">
                  <span className={`ai-tag${aiState.results[s.id]?.by === 'claude' ? ' claude' : ''}`}>
                    {aiState.results[s.id]?.by === 'claude' ? 'Claude' : aiState.results[s.id] ? 'Gemini' : 'AI'}
                  </span>
                  {aiState.results[s.id]?.comment || s.feedback}
                </p>
              ) : (
                <span className="word-tag">{aiOn && aiState.busy ? 'AI is reading this…' : 'Word check only'}</span>
              )}
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
      <button className="btn primary big" type="button" disabled={busy || action.disabled} onClick={action.onClick}>
        {busy ? 'Working…' : action.label}
      </button>
      {!round.published && <p className="muted small">Publishing also closes the round, so late prompts can't come in.</p>}
      {saved && <p className="success">Scores published. Students see them now.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function AiSettingsCard({ ai, setAi }: { ai: AiSettings; setAi: (s: AiSettings) => void }) {
  const [key, setKey] = useState(ai.apiKey);
  const [model, setModel] = useState(ai.model);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  async function saveAndTest() {
    const next = { ...ai, apiKey: key.trim(), model: model.trim() || DEFAULT_MODEL };
    setAi(next);
    setTesting(true);
    setStatus(null);
    try {
      const r = await aiTest(next);
      setModels(r.available);
      if (r.switched) {
        setModel(r.model);
        setAi({ ...next, model: r.model });
        setStatus({ ok: true, text: `Saved. "${next.model}" isn't available right now, so it uses ${r.model}. Gemini is working.` });
      } else {
        setStatus({ ok: true, text: `Saved. Gemini (${r.model}) is working.` });
      }
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card stack">
      <div className="row between">
        <h2>AI scoring</h2>
        <button
          type="button"
          className={`switch${ai.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={ai.enabled}
          aria-label="AI scoring"
          onClick={() => setAi({ ...ai, enabled: !ai.enabled })}
        >
          <span className="switch-knob" />
          <span className="switch-text">{ai.enabled ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p className="muted small">
        {ai.enabled
          ? 'AI reads each prompt as it arrives, ticks the parts, suggests a bonus and writes a short comment. Gemini goes first; Claude takes over if Gemini fails. You can still change everything before publishing.'
          : 'Off: prompts are scored by the word check only.'}
      </p>
      {ai.enabled && (
        <>
          <label className="label" htmlFor="ai-key">Gemini API key</label>
          <div className="row">
            <input id="ai-key" className="input" type={show ? 'text' : 'password'} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" />
            <button className="btn small" type="button" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <label className="label" htmlFor="ai-model">Model</label>
          <input id="ai-model" className="input" list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} />
          <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          <button className="btn primary" type="button" disabled={testing || key.trim().length < 10} onClick={saveAndTest}>
            {testing ? 'Testing…' : 'Save and test'}
          </button>
          {status && <p className={status.ok ? 'success' : 'error'} role="status">{status.text}</p>}
          <p className="muted small">
            Get a free key at <a className="link-inline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.
            The key stays in this browser only. Students never see it.
          </p>
        </>
      )}
    </section>
  );
}

function useClaudeUsage(): ClaudeUsage {
  const [usage, setUsage] = useState<ClaudeUsage>(loadUsage);
  useEffect(() => {
    const update = () => setUsage(loadUsage());
    window.addEventListener('claude-usage', update);
    window.addEventListener('storage', update); // another tab
    const t = setInterval(update, 30_000);      // picks up the new day
    return () => { window.removeEventListener('claude-usage', update); window.removeEventListener('storage', update); clearInterval(t); };
  }, []);
  return usage;
}

/** "AI retries automatically in 1:20." while a backoff is running. */
function RetryCountdown({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  const left = Math.ceil((at - now) / 1000);
  if (!at || left <= 0) return <>AI is trying again automatically.</>;
  return <>AI retries automatically in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}.</>;
}

function ClaudeCard({ claude, setClaude }: { claude: ClaudeSettings; setClaude: (c: ClaudeSettings) => void }) {
  const usage = useClaudeUsage();
  const [key, setKey] = useState(claude.apiKey);
  const [model, setModel] = useState(claude.model);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function saveAndTest() {
    const next = { ...claude, apiKey: key.trim(), model: model.trim() || DEFAULT_CLAUDE_MODEL };
    setClaude(next);
    setTesting(true);
    setStatus(null);
    try {
      await claudeTest(next);
      setStatus({ ok: true, text: `Saved. Claude (${next.model}) is working.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card stack">
      <div className="row between">
        <h2>Claude fallback</h2>
        <button
          type="button"
          className={`switch${claude.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={claude.enabled}
          aria-label="Claude fallback"
          onClick={() => setClaude({ ...claude, enabled: !claude.enabled })}
        >
          <span className="switch-knob" />
          <span className="switch-text">{claude.enabled ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p className="muted small">
        {claude.enabled
          ? 'When Gemini is busy, rate-limited or fails, Claude scores the remaining prompts. With no Gemini key, Claude scores everything. Claude is paid per use.'
          : 'Off: if Gemini fails, the word check scores stay.'}
      </p>
      {claude.enabled && (
        <>
          <label className="label" htmlFor="claude-key">Anthropic API key</label>
          <div className="row">
            <input id="claude-key" className="input" type={show ? 'text' : 'password'} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />
            <button className="btn small" type="button" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <label className="label" htmlFor="claude-model">Model</label>
          <input id="claude-model" className="input" list="claude-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_CLAUDE_MODEL} />
          <datalist id="claude-models">{CLAUDE_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <button className="btn primary" type="button" disabled={testing || key.trim().length < 20} onClick={saveAndTest}>
            {testing ? 'Testing…' : 'Save and test'}
          </button>
          {status && <p className={status.ok ? 'success' : 'error'} role="status">{status.text}</p>}
          <div className="limits">
            <label className="label" htmlFor="claude-per-day">Calls per day</label>
            <input
              id="claude-per-day" className="input" type="number" min={1} max={500} value={claude.perDay}
              onChange={(e) => setClaude({ ...claude, perDay: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
            />
            <label className="label" htmlFor="claude-per-round">Calls per round</label>
            <input
              id="claude-per-round" className="input" type="number" min={1} max={50} value={claude.perRound}
              onChange={(e) => setClaude({ ...claude, perRound: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
            />
          </div>
          <p className={`small ${usage.calls >= claude.perDay ? 'error' : 'muted'}`}>
            Today: {usage.calls} of {claude.perDay} Claude calls · about ${usage.usd.toFixed(2)} spent (estimate). One call scores up to 20 prompts.
          </p>
          <p className="muted small">
            Get a key at <a className="link-inline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> and set a monthly spend limit there.
            The key stays in this browser only. claude-haiku-5-5 is the cheapest model.
          </p>
        </>
      )}
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
  const left = useSecondsLeft(round?.ends_at);
  const url = window.location.origin + '/';
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#1d3a31', light: '#f4f1e6' } }).then(setQr).catch(() => setQr(''));
  }, [url]);

  // Confetti once per published round on the big screen.
  const celebrated = useRef<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    if (round?.published && board.length && celebrated.current !== round.id) {
      celebrated.current = round.id;
      setConfetti(true);
    }
  }, [round?.published, round?.id, board.length]);

  const stage = !round ? 'ready' : round.published ? 'results' : left > 0 ? 'live' : 'checking';
  const top3 = round?.published
    ? [...subs].filter((s) => s.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
    : [];
  const senders = [...subs].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-40);
  const leader = board[0];

  return (
    <>
      <RainBackground />
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      <div className="projector">
        <section className="proj-join">
          <span className="scan-label">{t.scanToJoin}</span>
          <div className="qr-frame">{qr && <img className="qr" src={qr} alt={`QR code for ${url}`} />}</div>
          <p className="proj-url">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
          <p className="muted">{t.scanJoin}</p>
          <div className="row wrap center">
            <LangToggle lang={lang} onChange={setLang} />
            <button className="btn" type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Full screen</button>
          </div>
        </section>

        <section className="proj-main" lang={lang}>
          {stage === 'ready' && (
            <div className="proj-card proj-hero enter">
              <div className="bounce-drop big" aria-hidden="true" />
              <h1 className="proj-q">{t.getReady}</h1>
            </div>
          )}

          {(stage === 'live' || stage === 'checking') && round && (
            <>
              <div className="proj-card enter">
                <div className="row between wrap">
                  <span className="eyebrow">{t.challenge}</span>
                  {method && <span className="method-pill big-pill">{method.name[lang]}</span>}
                </div>
                <h1 className="proj-q">{round.question}</h1>
              </div>

              <div className="proj-live enter">
                <TimerRing startedAt={round.started_at} endsAt={round.ends_at} doneLabel={t.timesUp} huge />
                <div className="proj-counter">
                  <span key={subs.length} className="counter-num">{subs.length}</span>
                  <span className="counter-label">{t.promptsWord(subs.length)}</span>
                </div>
              </div>

              {stage === 'checking' && <p className="proj-banner enter">{t.checking}</p>}

              {senders.length > 0 && (
                <div className="proj-card enter">
                  <span className="eyebrow">{t.sentSoFar}</span>
                  <div className="bubbles">
                    {senders.map((s) => (
                      <span key={s.id} className="bubble">
                        <span className="bubble-avatar">{s.name.trim().charAt(0).toUpperCase() || '?'}</span>
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {stage === 'live' && method && <MethodCard method={method} lang={lang} big />}
            </>
          )}

          {stage === 'results' && round && (
            <>
              {leader && (
                <div className="proj-winner enter">
                  <svg className="trophy" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true">
                    <path d="M18 8h28v10a14 14 0 0 1-28 0z" fill="#ffd45c" />
                    <path d="M18 12H9a9 9 0 0 0 11 13M46 12h9a9 9 0 0 1-11 13" fill="none" stroke="#ffd45c" strokeWidth="4" strokeLinecap="round" />
                    <path d="M28 31h8v9h-8z" fill="#e8b93a" />
                    <rect x="20" y="40" width="24" height="6" rx="2" fill="#ffd45c" />
                    <rect x="16" y="46" width="32" height="8" rx="3" fill="#e8b93a" />
                    <path d="M32 13l2.4 4.9 5.4.8-3.9 3.8.9 5.3L32 25.3l-4.8 2.5.9-5.3-3.9-3.8 5.4-.8z" fill="#fff6d6" />
                  </svg>
                  <div className="stack tight">
                    <span className="eyebrow">{t.leading}</span>
                    <span className="winner-big-name">{leader.name}</span>
                    <span className="winner-points">{t.totalPoints(leader.total)}</span>
                  </div>
                </div>
              )}

              <div className="proj-card enter">
                <span className="eyebrow">{t.leaderboard}</span>
                <Podium rows={board} youLabel={t.you} />
                {board.length > 3 && <Leaderboard rows={board} limit={10} skip={3} big emptyText={t.boardEmpty} youLabel={t.you} />}
              </div>

              {top3.length > 0 && (
                <div className="proj-card enter">
                  <span className="eyebrow">{t.bestPrompts}</span>
                  <h2 className="proj-sub">{round.question}</h2>
                  <ol className="top-prompts">
                    {top3.map((s, i) => (
                      <li key={s.id} className={i === 0 ? 'best' : ''}>
                        <div className="row between">
                          <strong className="tp-name"><span className={`tp-rank r${i + 1}`}>{i + 1}</span>{s.name}</strong>
                          <span className="sub-score">{s.score}</span>
                        </div>
                        <blockquote className="quote">{s.prompt}</blockquote>
                        {s.feedback && <p className="ai-comment"><span className="ai-tag">AI</span>{s.feedback}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

// ───────────── Questions ─────────────

function Questions() {
  const [list, setList] = useState<Question[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [qPage, setQPage] = useState(0);
  const { pageItems, pages, page } = paginate(list, qPage, 10);
  const missing = SAMPLE_QUESTIONS.filter((q) => !list.some((x) => x.text.trim() === q));

  const load = async () => {
    const { data, error } = await supabase.from('questions').select('*').order('created_at');
    if (error) setError(friendly(error));
    setList((data ?? []) as Question[]);
  };
  useEffect(() => { load(); }, []);

  async function addSamples() {
    if (!missing.length) return;
    setAdding(true);
    setError('');
    const { error } = await supabase.from('questions').insert(missing.map((q) => ({ text: q })));
    setAdding(false);
    if (error) { setError(friendly(error)); return; }
    setNote(`Added ${missing.length} questions.`);
    await load();
  }

  return (
    <section className="card stack narrow-card">
      <div className="row between wrap">
        <h2>Question bank</h2>
        <span className="muted small">{list.length} questions</span>
      </div>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim().length < 3) return;
          const { error } = await supabase.from('questions').insert({ text: text.trim() });
          if (error) { setError(friendly(error)); return; }
          setText('');
          setError('');
          await load();
          setQPage(Number.MAX_SAFE_INTEGER); // show the last page, where the new question is
        }}
      >
        <input id="new-q" className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Ask AI to…" />
        <button className="btn primary" type="submit" disabled={text.trim().length < 3}>Add</button>
      </form>
      {missing.length > 0 && (
        <div className="sample-box">
          <p className="small">{missing.length} ready-made questions (science, maths, environment, Kerala, study skills; English and Malayalam) aren't in your bank yet.</p>
          <button className="btn" type="button" disabled={adding} onClick={addSamples}>{adding ? 'Adding…' : `Add ${missing.length} sample questions`}</button>
        </div>
      )}
      {note && <p className="success small">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="q-list">
        {pageItems.map((q) => (
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
      <Pager page={page} pages={pages} onPage={setQPage} />
    </section>
  );
}
