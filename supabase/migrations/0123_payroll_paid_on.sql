-- The day a coach's pay lands (or is scheduled to), set when Finance
-- marks a run paid — payroll goes out through Patriot by direct deposit,
-- so this can be a few days after it's processed (e.g. processed 10/1,
-- in accounts by 10/5). Null while unpaid. Coaches see "Paid 10/5" (or
-- "Paying 10/5" before that date) on their payroll page.
alter table payroll_entries add column if not exists paid_on date;
