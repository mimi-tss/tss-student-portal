-- Coaches are spread across multiple timezones — working_hours ("09:00"
-- etc.) is meaningless without knowing which zone it's local to. Defaults
-- existing coaches to America/New_York; update each coach's real zone
-- directly until the (not-yet-built) coach onboarding form collects it.
alter table coaches add column timezone text not null default 'America/New_York';
