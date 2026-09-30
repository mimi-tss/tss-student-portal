-- Per-topic notification switches (studio call 2026-09-30), replacing the
-- single "Alerts" group so a student can e.g. get texts for lesson
-- reminders only. Email / Text per topic; text only where we ever text.
-- Every new switch starts as the student's current Alerts choice, so
-- nobody's settings change. The weekly digest keeps notify_digest_email.
-- The in-app bell becomes always-on (no more toggle), so the old
-- *_inapp columns are set true and left in place.
alter table students
  add column if not exists notify_reminders_email boolean not null default true,
  add column if not exists notify_reminders_sms boolean not null default false,
  add column if not exists notify_bookings_email boolean not null default true,
  add column if not exists notify_bookings_sms boolean not null default false,
  add column if not exists notify_credits_email boolean not null default true,
  add column if not exists notify_credits_sms boolean not null default false,
  add column if not exists notify_messages_email boolean not null default true,
  add column if not exists notify_recordings_email boolean not null default true;

update students set
  notify_reminders_email = notify_alerts_email,
  notify_reminders_sms = notify_alerts_sms,
  notify_bookings_email = notify_alerts_email,
  notify_bookings_sms = notify_alerts_sms,
  notify_credits_email = notify_alerts_email,
  notify_credits_sms = notify_alerts_sms,
  notify_messages_email = notify_alerts_email,
  notify_recordings_email = notify_alerts_email,
  notify_alerts_inapp = true,
  notify_digest_inapp = true;
