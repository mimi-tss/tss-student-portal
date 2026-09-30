-- Bell rows for the "your payment didn't go through" notice
-- (app/api/webhooks/stripe, invoice.payment_failed). notifications.kind is
-- a closed list — same pattern as 0113/0114.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'session_starting_soon','session_reminder_24h','recording_ready',
  'makeup_credit_needs_scheduling','weekly_digest','group_lesson_cancelled',
  'session_booked','group_session_booked','session_cancelled','fifth_week_offer',
  'session_missed','payment_failed'
));
