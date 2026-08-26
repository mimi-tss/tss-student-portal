-- Referral bonus: a student can be tagged as referred by a specific
-- coach, who then earns a permanent per-hour bonus (see
-- lib/payroll/calculate.ts's REFERRAL_BONUS_PER_HOUR) whenever they're
-- the one teaching that student — indefinitely, not just on the first
-- booking. Nullable FK, not a boolean flag, since the bonus needs to
-- know *which* coach gets credit (and stops applying if that student's
-- sessions are taught by someone else).
alter table students
  add column referred_by_coach_id uuid references coaches (id);

-- No new RLS policy needed — "admins can update all students" (0007)
-- already covers every column on this table.
