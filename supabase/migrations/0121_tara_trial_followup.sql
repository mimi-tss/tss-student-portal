-- New Needs Review kind: tara_trial_done — a free first session with Tara
-- just happened (attended or missed), so the studio follows up by hand:
-- Master Course, or a spot in Tara's schedule (studio call 2026-10-02).
-- Raised by the session-reminders job; dedup_key = the session id, so each
-- trial gets one item and resolving it sticks.
alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc','cancel_request','trial_unbooked','credit_expiring','upgraded_suite','upgraded_pro','upgraded_elite',
  'coach_block_added','no_show_1','no_show_2','no_show_3','no_recurring_schedule','hold_ending_soon',
  'inactive_10_days','recording_unmatched','recording_missing','fifth_week_available','group_lesson_understaffed',
  'kajabi_grant_failed','pause_request','change_plan_request','recording_pipeline_stale','schedule_overlap',
  'tara_trial_done'
));

create unique index if not exists attention_items_tara_trial_done_uidx
  on attention_items (dedup_key)
  where kind = 'tara_trial_done';
