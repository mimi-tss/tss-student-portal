-- A student can now have more than one recurring weekly slot (e.g.
-- paying for 2x/week — two different day/times, same or different
-- coach). recurring_schedules.student_id was `unique` since 0020,
-- capping every student at exactly one — every consumer already loops
-- over "schedules for a student" rather than assuming a single row
-- (materializeRecurringSessions, getHeldRecurringSlots,
-- attention-items' scheduledStudentIds set), so this is purely a
-- constraint relaxation plus the small number of `.maybeSingle()` call
-- sites fixed alongside this migration in application code.
--
-- Replaced with a narrower one: the same student can't have two
-- schedule rows at the identical day-of-week + start_time (a literal
-- duplicate would only ever be a data-entry mistake, not a real second
-- slot — a student can only be in one lesson at a time regardless of
-- which coach it's with).
alter table recurring_schedules drop constraint recurring_schedules_student_id_key;

alter table recurring_schedules
  add constraint recurring_schedules_student_day_time_key
  unique (student_id, day_of_week, start_time);
