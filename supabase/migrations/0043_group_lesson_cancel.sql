-- Group lessons had no cancellation concept at all — no status column,
-- and group_lesson_registrations has no FK cascade, so a hard delete
-- would either fail outright (once anyone's registered) or silently
-- destroy attendance/payment history for students who already paid.
-- Soft-cancel instead, same reasoning as sessions' cancelled statuses:
-- the row (and every registration under it) stays exactly as it was.
alter table group_lessons add column cancelled_at timestamptz;
