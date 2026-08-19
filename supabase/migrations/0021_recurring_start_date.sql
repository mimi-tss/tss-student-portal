-- When a recurring schedule takes effect — set explicitly by admin
-- (defaults to today), including when *changing* an existing schedule,
-- so "Fridays 3:30pm starting now, Fridays 6pm starting Oct 1" is
-- expressible: occurrences before start_date keep whatever pattern
-- generated them, occurrences from start_date onward use the row's
-- current day_of_week/start_time. See lib/scheduling/recurring.ts.
alter table recurring_schedules add column start_date date not null default current_date;
