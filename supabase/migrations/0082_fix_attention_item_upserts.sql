-- (renumbered from an initial 0081 — a concurrent session independently
-- claimed that number for admin_delete_makeup_credits, already applied)
--
-- Every "condition-driven" attention_items upsert in this app targets a
-- PARTIAL unique index (0062's 6-kind index, 0078's two recording
-- indexes, 0080's new fifth-week index) via supabase-js's
-- `.upsert(data, { onConflict: "col1,col2" })`. Confirmed directly
-- against this database: Postgres requires an ON CONFLICT clause's
-- WHERE predicate to match a partial index's own predicate EXACTLY for
-- inference to succeed — supabase-js's onConflict option has no way to
-- express that extra WHERE clause, so every one of these calls has been
-- failing with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" (42P10) since the day each index was
-- introduced. None of these callers ever checked the returned error, so
-- this failed completely silently — the Needs Review page's
-- condition-driven kinds have likely never actually auto-populated;
-- confirmed empirically via a direct probe against six different real
-- students/kinds, all failing identically, before this fix.
--
-- Fix: do the insert inside a SECURITY DEFINER function instead, where
-- the ON CONFLICT clause CAN repeat each index's own WHERE predicate —
-- something no client-side call can express. One function per distinct
-- index shape already in the table. is_admin() is checked inside each
-- one, same defense-in-depth reasoning delete_student_permanently()
-- already established (security definer bypasses RLS entirely, so it
-- isn't optional) — every call site here is already admin-gated at the
-- API route/page level, so this never rejects a legitimate caller.

create or replace function attention_item_upsert_condition(
  p_kind text,
  p_student_id uuid,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, student_id, summary)
  values (p_kind, p_student_id, p_summary)
  on conflict (student_id, kind) where student_id is not null and kind in (
    'dnc', 'credit_expiring', 'trial_unbooked',
    'no_recurring_schedule', 'hold_ending_soon', 'inactive_10_days'
  )
  do nothing;
end;
$$;

create or replace function attention_item_upsert_recording_unmatched(
  p_recording_id uuid,
  p_coach_id uuid,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, recording_id, coach_id, summary)
  values ('recording_unmatched', p_recording_id, p_coach_id, p_summary)
  on conflict (recording_id, kind) where recording_id is not null and kind = 'recording_unmatched'
  do nothing;
end;
$$;

create or replace function attention_item_upsert_recording_missing(
  p_session_id uuid,
  p_student_id uuid,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, session_id, student_id, summary)
  values ('recording_missing', p_session_id, p_student_id, p_summary)
  on conflict (session_id, kind) where session_id is not null and kind = 'recording_missing'
  do nothing;
end;
$$;

create or replace function attention_item_upsert_fifth_week(
  p_student_id uuid,
  p_coach_id uuid,
  p_occurrence_at timestamptz,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, student_id, coach_id, occurrence_at, summary)
  values ('fifth_week_available', p_student_id, p_coach_id, p_occurrence_at, p_summary)
  on conflict (student_id, kind, occurrence_at) where student_id is not null and kind = 'fifth_week_available'
  do nothing;
end;
$$;

revoke all on function attention_item_upsert_condition from public;
revoke all on function attention_item_upsert_recording_unmatched from public;
revoke all on function attention_item_upsert_recording_missing from public;
revoke all on function attention_item_upsert_fifth_week from public;

grant execute on function attention_item_upsert_condition to authenticated;
grant execute on function attention_item_upsert_recording_unmatched to authenticated;
grant execute on function attention_item_upsert_recording_missing to authenticated;
grant execute on function attention_item_upsert_fifth_week to authenticated;
