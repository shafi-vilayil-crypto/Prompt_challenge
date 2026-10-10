-- Prompt Challenge update 2: prompting methods (and some Malayalam questions).
-- Run once in Supabase → SQL Editor → New query → paste all → Run.
-- Safe to run again. Not needed on a fresh project set up with the current schema.sql.

-- Each round remembers the prompting method the teacher picked.
alter table public.rounds add column if not exists method text not null default 'basic';
alter table public.rounds drop constraint if exists rounds_method_check;
alter table public.rounds add constraint rounds_method_check check (method ~ '^[a-z_]{2,20}$');

-- start_round now takes the method.
drop function if exists public.start_round(text, int);
create or replace function public.start_round(p_question text, p_seconds int, p_method text default 'basic')
returns public.rounds
language plpgsql security definer set search_path = public as $$
declare r public.rounds;
begin
  if not public.is_teacher() then raise exception 'Only the teacher can start a round' using errcode = '42501'; end if;
  if p_seconds is null or p_seconds not between 10 and 1800 then raise exception 'Time must be 10 seconds to 30 minutes'; end if;
  if char_length(btrim(coalesce(p_question, ''))) < 3 then raise exception 'Pick a question first'; end if;
  if coalesce(p_method, 'basic') !~ '^[a-z_]{2,20}$' then raise exception 'Unknown prompting method'; end if;
  update public.rounds set ends_at = now() where ends_at > now();   -- close any open round
  insert into public.rounds (question, ends_at, method)
    values (btrim(p_question), now() + make_interval(secs => p_seconds), coalesce(p_method, 'basic'))
    returning * into r;
  return r;
end $$;
revoke execute on function public.start_round(text, int, text) from public, anon;
grant execute on function public.start_round(text, int, text) to authenticated;

-- Each method has its own parts (at most 6), so accept any part name and count at most 6.
create or replace function public.publish_round(p_round uuid, p_scores jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can publish scores' using errcode = '42501'; end if;
  update public.submissions s set
    parts = coalesce((
      select array_agg(distinct p)
      from jsonb_array_elements_text(x.value -> 'parts') p
      where p ~ '^[a-z_]{2,20}$'
    ), '{}'),
    bonus = least(3, greatest(0, coalesce((x.value ->> 'bonus')::int, 0)))
  from jsonb_array_elements(p_scores) x
  where s.round_id = p_round and s.id = (x.value ->> 'id')::uuid;
  update public.submissions set score = 2 * least(cardinality(parts), 6) + bonus where round_id = p_round;
  update public.rounds set published = true, ends_at = least(ends_at, now()) where id = p_round;
end $$;

-- A few Malayalam questions for the bank.
insert into public.questions (text)
select q from (values
  ('ജലചക്രം ഏഴാം ക്ലാസ് കുട്ടിക്ക് മനസ്സിലാകുന്ന രീതിയിൽ വിശദീകരിക്കാൻ AI-യോട് ആവശ്യപ്പെടുക.'),
  ('ഓണത്തെക്കുറിച്ച് ഒരു ചെറിയ കവിത എഴുതാൻ AI-യോട് ആവശ്യപ്പെടുക.'),
  ('പരീക്ഷയ്ക്ക് ഒരാഴ്ചത്തെ പഠന പ്ലാൻ ഉണ്ടാക്കാൻ AI-യോട് ആവശ്യപ്പെടുക.'),
  ('വീട്ടിൽ വെള്ളം ലാഭിക്കാനുള്ള 5 വഴികൾ AI-യോട് ചോദിക്കുക.')
) v(q)
where not exists (select 1 from public.questions where text = v.q);

notify pgrst, 'reload schema';
