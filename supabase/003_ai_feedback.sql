-- Prompt Challenge update 3: save the AI comment for each prompt so students see it with their score.
-- Run once in Supabase → SQL Editor → New query → paste all → Run. Safe to run again.
-- Needs update 2 (002_methods.sql) first. Not needed on a fresh project set up with the current schema.sql.

alter table public.submissions add column if not exists feedback text;
alter table public.submissions drop constraint if exists submissions_feedback_check;
alter table public.submissions add constraint submissions_feedback_check check (char_length(feedback) <= 300);

-- publish_round also saves each prompt's comment ("comment" in p_scores).
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
    bonus = least(3, greatest(0, coalesce((x.value ->> 'bonus')::int, 0))),
    feedback = nullif(left(btrim(coalesce(x.value ->> 'comment', '')), 300), '')
  from jsonb_array_elements(p_scores) x
  where s.round_id = p_round and s.id = (x.value ->> 'id')::uuid;
  update public.submissions set score = 2 * least(cardinality(parts), 6) + bonus where round_id = p_round;
  update public.rounds set published = true, ends_at = least(ends_at, now()) where id = p_round;
end $$;

notify pgrst, 'reload schema';
