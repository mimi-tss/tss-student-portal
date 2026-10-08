-- Student self-setup of a weekly lesson (app/(student)/student/weekly-lesson,
-- app/api/student/weekly-lesson). Two independent parts — the app works
-- before either is applied.
--
-- PART 1: new Needs Review kind weekly_setup_issue. Until this runs, the
-- app files those items as schedule_overlap instead.
alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc','cancel_request','trial_unbooked','credit_expiring','upgraded_suite','upgraded_pro','upgraded_elite',
  'coach_block_added','no_show_1','no_show_2','no_show_3','no_recurring_schedule','hold_ending_soon',
  'inactive_10_days','recording_unmatched','recording_missing','fifth_week_available','group_lesson_understaffed',
  'kajabi_grant_failed','pause_request','change_plan_request','recording_pipeline_stale','schedule_overlap',
  'tara_trial_done','weekly_setup_issue'
));

-- PART 2: database-level guard that a coach can never hold two active
-- weekly slots that overlap on the same weekday. The app already checks
-- this before and after saving (lib/admin/create-recurring-schedule.ts);
-- this is the backstop if two saves ever interleave exactly. A refused
-- save surfaces as "someone else just took that time with this coach".
--
-- BEFORE running part 2, run this read-only check. If it returns any
-- rows, existing slots already overlap and the constraint will fail to
-- create — fix those first on the admin student pages (or skip part 2).
-- It also means two BIWEEKLY students on alternating weeks can't share
-- one time slot; if the studio does that on purpose, skip part 2.
--
--   select a.coach_id, a.day_of_week, a.start_time, a.duration_minutes, a.student_id,
--          b.start_time as other_start, b.duration_minutes as other_duration, b.student_id as other_student
--   from recurring_schedules a
--   join recurring_schedules b
--     on a.coach_id = b.coach_id and a.day_of_week = b.day_of_week and a.id < b.id
--   where a.active and b.active
--     and int4range(split_part(a.start_time, ':', 1)::int * 60 + split_part(a.start_time, ':', 2)::int,
--                   split_part(a.start_time, ':', 1)::int * 60 + split_part(a.start_time, ':', 2)::int + a.duration_minutes)
--      && int4range(split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int,
--                   split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int + b.duration_minutes);

create extension if not exists btree_gist;

alter table recurring_schedules
  add constraint recurring_schedules_coach_no_overlap
  exclude using gist (
    coach_id with =,
    day_of_week with =,
    int4range(
      split_part(start_time, ':', 1)::int * 60 + split_part(start_time, ':', 2)::int,
      split_part(start_time, ':', 1)::int * 60 + split_part(start_time, ':', 2)::int + duration_minutes
    ) with &&
  )
  where (active);
