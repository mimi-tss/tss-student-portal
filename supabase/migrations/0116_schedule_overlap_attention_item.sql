-- New Needs Review kind: schedule_overlap — a booked 1:1 lesson that
-- overlaps something else on the calendar (another lesson with the same
-- coach, that coach's group class, a group class the student is in, or
-- the coach's time off). Booking itself now refuses these
-- (app/api/booking/book), but admin "Add session", time off added after
-- a booking, and older data can still produce them; the scan in
-- lib/admin/schedule-overlaps.ts raises one item per clash.
--
-- dedup_key identifies the clash (the two things overlapping), so the
-- same clash is only ever raised once — resolving it sticks, like every
-- other condition-driven kind.
alter table attention_items add column dedup_key text;

alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc',
  'cancel_request',
  'trial_unbooked',
  'credit_expiring',
  'upgraded_suite',
  'upgraded_pro',
  'upgraded_elite',
  'coach_block_added',
  'no_show_1',
  'no_show_2',
  'no_show_3',
  'no_recurring_schedule',
  'hold_ending_soon',
  'inactive_10_days',
  'recording_unmatched',
  'recording_missing',
  'fifth_week_available',
  'group_lesson_understaffed',
  'kajabi_grant_failed',
  'pause_request',
  'change_plan_request',
  'recording_pipeline_stale',
  'schedule_overlap'
));

create unique index attention_items_schedule_overlap_uidx
  on attention_items (dedup_key)
  where kind = 'schedule_overlap';

-- Same security-definer + service_role pattern as 0088/0108: ON CONFLICT
-- against a partial index needs the predicate restated, which
-- supabase-js's .upsert() can't express.
create or replace function attention_item_upsert_schedule_overlap(
  p_dedup_key text,
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

  insert into attention_items (kind, student_id, coach_id, occurrence_at, summary, dedup_key)
  values ('schedule_overlap', p_student_id, p_coach_id, p_occurrence_at, p_summary, p_dedup_key)
  on conflict (dedup_key) where kind = 'schedule_overlap'
  do nothing;
end;
$$;

revoke all on function attention_item_upsert_schedule_overlap from public;
grant execute on function attention_item_upsert_schedule_overlap to authenticated, service_role;
