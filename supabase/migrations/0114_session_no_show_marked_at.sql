-- When a 1:1 session was marked no-show — the clock for the missed-lesson
-- email's 2-hour grace period (app/api/cron/session-reminders). Set by
-- the coach/admin attendance routes when status becomes 'no-show',
-- cleared when it changes to anything else, so a mis-click corrected
-- within 2 hours never emails the student.
alter table sessions add column no_show_marked_at timestamptz;

create index sessions_no_show_marked_at_idx on sessions (no_show_marked_at) where no_show_marked_at is not null;

-- Bell rows for the missed-lesson notification.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'session_starting_soon','session_reminder_24h','recording_ready',
  'makeup_credit_needs_scheduling','weekly_digest','group_lesson_cancelled',
  'session_booked','group_session_booked','session_cancelled','fifth_week_offer',
  'session_missed'
));
