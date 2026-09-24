-- Holiday lessons: a weekly student's lesson lost to a studio holiday is
-- replaced by that billing cycle's 5th week when there is one
-- (occurrencesFor, lib/scheduling/recurring.ts); otherwise the daily
-- cron grants a studio-planned makeup credit
-- (lib/scheduling/holiday-credits.ts). These two columns tie each such
-- credit to the schedule + holiday that produced it, and the unique
-- index makes the daily grant idempotent — one credit per schedule per
-- holiday, however many times the cron re-runs.
alter table makeup_credits
  add column source_holiday_date date,
  add column source_recurring_schedule_id uuid references recurring_schedules (id) on delete set null;

create unique index makeup_credits_holiday_uidx
  on makeup_credits (source_recurring_schedule_id, source_holiday_date)
  where source_holiday_date is not null;
