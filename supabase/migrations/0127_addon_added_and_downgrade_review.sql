-- 1) Bell rows for the add-on confirmation (addon_added: a student added a
--    recurring add-on such as bi-weekly lessons). Keeps weekly_time_needed
--    (0126 on the weekly-nudge branch) so running these in either order works.
-- 2) Needs Review kind downgraded_has_schedule: a student moved from
--    Pro/Elite to Suite but still has a weekly lesson schedule — the team
--    removes it (studio call 2026-10-08). Keeps weekly_setup_issue (0125,
--    already applied) in the list.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'session_starting_soon','session_reminder_24h','recording_ready',
  'makeup_credit_needs_scheduling','weekly_digest','group_lesson_cancelled',
  'session_booked','group_session_booked','session_cancelled','fifth_week_offer',
  'session_missed','payment_failed','weekly_time_needed','addon_added'
));

alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc','cancel_request','trial_unbooked','credit_expiring','upgraded_suite','upgraded_pro','upgraded_elite',
  'coach_block_added','no_show_1','no_show_2','no_show_3','no_recurring_schedule','hold_ending_soon',
  'inactive_10_days','recording_unmatched','recording_missing','fifth_week_available','group_lesson_understaffed',
  'kajabi_grant_failed','pause_request','change_plan_request','recording_pipeline_stale','schedule_overlap',
  'tara_trial_done','weekly_setup_issue','downgraded_has_schedule'
));
