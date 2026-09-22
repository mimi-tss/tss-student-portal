-- New Needs Review kind: recording_pipeline_stale. Distinct from the
-- two existing recording kinds (0078) — recording_unmatched/
-- recording_missing both concern one specific recording/session; this
-- one fires when NOTHING has landed in the shared Meet-recordings
-- Drive inbox at all for an extended window despite real sessions
-- happening, which those two can't catch (confirmed live: a 12-day
-- total pipeline blackout produced zero recording_unmatched items,
-- since there was nothing arriving to even be unmatched). Per direct
-- request, this stays Needs-Review-only — no Slack wiring, unlike
-- recording_match_fail/recording_pipeline_stale's own earlier Slack
-- attempt in scan-recordings, which is being replaced by this.
--
-- No natural student/coach/recording/session to scope this to — it's
-- one system-wide condition, not a per-entity one. Unique on (kind)
-- among still-open rows only: at most one open item at a time, but a
-- fresh one can be raised again after this one's resolved, in case the
-- blackout continues or recurs later.
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
  'recording_pipeline_stale'
));

create unique index attention_items_recording_pipeline_stale_uidx
  on attention_items (kind)
  where kind = 'recording_pipeline_stale' and status <> 'resolved';

-- Same security-definer pattern as every other condition-driven upsert
-- (0082's own comment: supabase-js's .upsert() onConflict can't express
-- a partial index's WHERE predicate, so ON CONFLICT inference has to
-- happen inside a function that can repeat it exactly).
create or replace function attention_item_upsert_recording_pipeline_stale(
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, summary)
  values ('recording_pipeline_stale', p_summary)
  on conflict (kind) where kind = 'recording_pipeline_stale' and status <> 'resolved'
  do nothing;
end;
$$;

revoke all on function attention_item_upsert_recording_pipeline_stale from public;
grant execute on function attention_item_upsert_recording_pipeline_stale to authenticated;
