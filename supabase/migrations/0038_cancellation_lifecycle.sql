-- Supports the admin student page's Start/Pause/Stop lifecycle bar.
-- (Admin already has full read/write on student_requests via 0034's
-- "admins can manage all requests" policy — no new RLS needed here.)
--
-- last_session_override: admin can correct the auto-computed "last
-- session" shown for a pending/approved cancellation (the real last
-- session sometimes needs to move — a makeup, a reschedule — and
-- shouldn't require touching the request row's other fields to fix).
alter table student_requests add column last_session_override date;
