-- Lets a recurring time-off rule (Team Huddle, a standing lunch break)
-- start on a future date instead of always materializing from today.
-- Nullable — same "blank means immediately" default the admin UI already
-- uses for one-off blocks, no backfill needed for existing rules.
alter table recurring_coach_blocks add column start_date date;
