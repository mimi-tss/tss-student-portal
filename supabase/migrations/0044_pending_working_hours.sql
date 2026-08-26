-- Lets an admin schedule a working-hours change ahead of time instead of
-- it applying the moment it's saved — the current live hours stay in
-- effect for near-term dates (already-viewable/bookable), and the new
-- ones take over starting pending_effective_date. Every reader that
-- walks a date range (booking slots, the coach calendar, utilization
-- metrics) resolves per-day against these two columns via
-- lib/scheduling/working-hours.ts rather than trusting working_hours
-- alone. Only one pending change is tracked at a time — saving a new one
-- (immediate or future) always replaces whatever was previously queued.
alter table coaches add column pending_working_hours jsonb;
alter table coaches add column pending_effective_date date;
