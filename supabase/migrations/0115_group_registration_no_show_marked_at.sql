-- Group-session counterpart of 0114: when a group registration was marked
-- no-show — the clock for the missed-group-session email's 2-hour grace
-- period (app/api/cron/session-reminders). Set/cleared by the group
-- attendance routes (lib/group-attendance.ts), which also tolerate this
-- column not existing yet.
alter table group_lesson_registrations add column no_show_marked_at timestamptz;

create index group_lesson_registrations_no_show_marked_at_idx
  on group_lesson_registrations (no_show_marked_at) where no_show_marked_at is not null;
