-- Optional free-text reason a student (or admin, cancelling on their
-- behalf) can attach when a session credit is earned via cancellation —
-- shown only on the admin/coach side alongside the credit's type
-- (students only ever see the generic credit name, never type or
-- reason). staff-cancel already required a reason (logged separately to
-- admin_overrides for audit); this makes it visible per-credit too.
alter table makeup_credits add column reason text;
