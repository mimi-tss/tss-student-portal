-- Bell rows for the student booking confirmation / cancellation
-- notifications (lib/notifications/booking-events.ts). notifications.kind
-- is a closed list, so the new kinds have to be added before any of these
-- can land in the bell — without this, the insert fails (logged, not
-- thrown) and only the email/text go out.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'session_starting_soon',
  'session_reminder_24h',
  'recording_ready',
  'makeup_credit_needs_scheduling',
  'weekly_digest',
  'group_lesson_cancelled',
  'session_booked',
  'group_session_booked',
  'session_cancelled'
));
