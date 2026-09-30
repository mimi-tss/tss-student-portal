-- Fixed monthly pay for a coach (e.g. Tara: $3,000/month) instead of the
-- per-hour rate. When set, lib/payroll/calculate.ts pays that coach's
-- lessons at $0 each (they still list, for the record) and adds one
-- salary line per period, prorated by day for a partial month. A payroll
-- run saves it as a manual payroll_entries row (reason 'Monthly salary');
-- the unique index keeps a re-run of the same period from paying it twice.
alter table coaches add column monthly_salary numeric(10, 2);

create unique index payroll_entries_monthly_salary_uidx
  on payroll_entries (coach_id, period_start, period_end)
  where is_manual and reason = 'Monthly salary';
