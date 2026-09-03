-- Lets syncComputedAttentionItems run from a service-role context (the
-- scan-recordings cron), not just from a real logged-in admin session.
--
-- Today recording_missing/recording_unmatched (and the other 5
-- condition-driven kinds) only get reconciled when an admin happens to
-- open the Needs Review page — getAttentionItems() calls
-- syncComputedAttentionItems() on every read, but nothing calls it on a
-- schedule. Confirmed live: a coach's recording can go missing for days
-- before anyone notices, because nobody thought to check that page.
-- Piggybacking this sync onto the existing 2-hour scan-recordings cron
-- (.github/workflows/scan-recordings.yml) closes that gap — but the 4
-- attention_item_upsert_* functions from 0082 reject anything that
-- isn't a real admin session (is_admin() reads profiles via auth.uid(),
-- which is null under the service-role key used by cron jobs — this was
-- previously confirmed live as the *correct*, intentional behavior for
-- a caller with no session at all, see PROGRESS.md's migration-0082
-- note). The scan-recordings route is already gated on its own
-- CRON_SECRET bearer check before any of this runs, so a service-role
-- caller reaching these functions is exactly as trusted as the admin
-- session they already accept — just via a different, already-verified
-- door.
create or replace function attention_item_upsert_condition(
  p_kind text,
  p_student_id uuid,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() and auth.role() <> 'service_role' then
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
  if not is_admin() and auth.role() <> 'service_role' then
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
  if not is_admin() and auth.role() <> 'service_role' then
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
  if not is_admin() and auth.role() <> 'service_role' then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, student_id, coach_id, occurrence_at, summary)
  values ('fifth_week_available', p_student_id, p_coach_id, p_occurrence_at, p_summary)
  on conflict (student_id, kind, occurrence_at) where student_id is not null and kind = 'fifth_week_available'
  do nothing;
end;
$$;

grant execute on function attention_item_upsert_condition to service_role;
grant execute on function attention_item_upsert_recording_unmatched to service_role;
grant execute on function attention_item_upsert_recording_missing to service_role;
grant execute on function attention_item_upsert_fifth_week to service_role;
