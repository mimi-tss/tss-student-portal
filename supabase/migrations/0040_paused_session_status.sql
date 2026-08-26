-- New session status: 'paused' — a real, already-materialized session
-- that fell inside a student's pause window at the moment they were
-- paused. Deliberately NOT reusing 'cancelled-no-notice' even though it
-- gets the identical "held, grey, no attendance" display treatment
-- (components/coach-calendar.tsx) — that status is a PAID status
-- (lib/payroll/calculate.ts's PAID_STATUSES), because a genuine
-- no-notice cancellation still compensates the coach for their reserved
-- time. A pause is admin-initiated and the coach should NOT be paid for
-- it, so it needs its own status that payroll simply never lists.
alter table sessions drop constraint sessions_status_check;
alter table sessions add constraint sessions_status_check
  check (status in (
    'scheduled',
    'attended',
    'no-show',
    'late-forfeit',
    'cancelled-with-notice',
    'cancelled-no-notice',
    'paused'
  ));
