-- Prompt Challenge: database setup.
-- Run once in Supabase → SQL Editor → New query → paste all → Run.
-- Before running, put your own teacher email in the line marked CHANGE ME (near the bottom).

-- ───────────── Tables ─────────────

-- Emails allowed to run the game (the teacher logins).
create table public.teachers (
  email text primary key
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 3 and 300),
  created_at timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  published boolean not null default false
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null,           -- random id kept on the student's phone
  name text not null check (char_length(btrim(name)) between 1 and 40),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 1000),
  parts text[] not null default '{}', -- rubric parts the teacher accepted
  bonus int not null default 0 check (bonus between 0 and 3),
  score int check (score between 0 and 15),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)        -- one answer per phone per round
);
create index submissions_round_idx on public.submissions (round_id);

-- ───────────── Helpers ─────────────

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teachers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Phones have wrong clocks; the apps use the server's time for the countdown.
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

-- ───────────── Access rules ─────────────

alter table public.teachers enable row level security;
alter table public.questions enable row level security;
alter table public.rounds enable row level security;
alter table public.submissions enable row level security;

revoke all on public.teachers from anon, authenticated;

-- Questions: teacher only.
revoke all on public.questions from anon;
create policy questions_teacher on public.questions for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- Rounds: everyone can see the current question and end time; only the teacher changes them.
revoke all on public.rounds from anon;
grant select on public.rounds to anon;
create policy rounds_read on public.rounds for select to anon, authenticated using (true);
create policy rounds_teacher on public.rounds for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- Submissions: students may only add a name and prompt, only while a round is open
-- (3 s grace for slow networks). They see answers only after the teacher publishes the scores.
revoke all on public.submissions from anon, authenticated;
grant insert (round_id, player_id, name, prompt) on public.submissions to anon, authenticated;
grant select on public.submissions to anon, authenticated;
grant update, delete on public.submissions to authenticated;

create policy submissions_insert_open_round on public.submissions for insert to anon, authenticated
  with check (exists (
    select 1 from public.rounds r
    where r.id = round_id
      and not r.published
      and now() between r.started_at and r.ends_at + interval '3 seconds'
  ));
create policy submissions_read_published on public.submissions for select to anon, authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and r.published));
create policy submissions_teacher on public.submissions for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- ───────────── Teacher actions (times come from the server clock) ─────────────

create or replace function public.start_round(p_question text, p_seconds int)
returns public.rounds
language plpgsql security definer set search_path = public as $$
declare r public.rounds;
begin
  if not public.is_teacher() then raise exception 'Only the teacher can start a round' using errcode = '42501'; end if;
  if p_seconds is null or p_seconds not between 10 and 1800 then raise exception 'Time must be 10 seconds to 30 minutes'; end if;
  if char_length(btrim(coalesce(p_question, ''))) < 3 then raise exception 'Pick a question first'; end if;
  update public.rounds set ends_at = now() where ends_at > now();   -- close any open round
  insert into public.rounds (question, ends_at)
    values (btrim(p_question), now() + make_interval(secs => p_seconds))
    returning * into r;
  return r;
end $$;

create or replace function public.end_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can end a round' using errcode = '42501'; end if;
  update public.rounds set ends_at = least(ends_at, now()) where id = p_round;
end $$;

create or replace function public.add_time(p_round uuid, p_seconds int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can add time' using errcode = '42501'; end if;
  if p_seconds not between 5 and 600 then raise exception 'Add 5 seconds to 10 minutes'; end if;
  update public.rounds set ends_at = greatest(ends_at, now()) + make_interval(secs => p_seconds)
    where id = p_round and not published;
end $$;

-- p_scores: [{ "id": "<submission id>", "parts": ["role","task",...], "bonus": 0-3 }, ...]
-- The score is always worked out here: 2 points per part + bonus (max 15).
create or replace function public.publish_round(p_round uuid, p_scores jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can publish scores' using errcode = '42501'; end if;
  update public.submissions s set
    parts = coalesce((
      select array_agg(distinct p)
      from jsonb_array_elements_text(x.value -> 'parts') p
      where p in ('role', 'task', 'audience', 'format', 'language', 'detail')
    ), '{}'),
    bonus = least(3, greatest(0, coalesce((x.value ->> 'bonus')::int, 0)))
  from jsonb_array_elements(p_scores) x
  where s.round_id = p_round and s.id = (x.value ->> 'id')::uuid;
  update public.submissions set score = 2 * cardinality(parts) + bonus where round_id = p_round;
  update public.rounds set published = true, ends_at = least(ends_at, now()) where id = p_round;
end $$;

revoke execute on function public.start_round(text, int), public.end_round(uuid),
  public.add_time(uuid, int), public.publish_round(uuid, jsonb) from public, anon;
grant execute on function public.start_round(text, int), public.end_round(uuid),
  public.add_time(uuid, int), public.publish_round(uuid, jsonb) to authenticated;
grant execute on function public.server_now() to anon, authenticated;

-- ───────────── Leaderboard (published rounds only) ─────────────

create or replace view public.leaderboard as
  select
    s.player_id,
    (array_agg(s.name order by s.created_at desc))[1] as name,
    sum(s.score)::int as total,
    count(*)::int as rounds
  from public.submissions s
  join public.rounds r on r.id = s.round_id
  where r.published and s.score is not null
  group by s.player_id;
grant select on public.leaderboard to anon, authenticated;

-- ───────────── Starting data ─────────────

insert into public.questions (text) values
  ('Ask AI to explain the water cycle to a 7th class student.'),
  ('Ask AI for a 5-day study plan for your next exam.'),
  ('Ask AI to write a short poem about your school.'),
  ('Ask AI for 5 ways to save water at home.'),
  ('Ask AI to explain what AI is to your grandmother, in Malayalam.'),
  ('Ask AI to make a 5-question quiz about plants.');

-- CHANGE ME: the email you will log in with as the teacher.
insert into public.teachers (email) values ('your-email@example.com');
