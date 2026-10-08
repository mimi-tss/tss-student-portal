-- Each recording's real start/end, from the Google Meet API (conference
-- record → recordings). The Drive filename carries the MEETING's start
-- time, not the recording's: a coach who keeps one meeting open for a
-- block of students and records each lesson separately gets
-- "12:01 EDT - Recording", "- Recording 2", ... all stamped 12:01. Matching
-- a recording to its lesson needs these instead.
alter table meet_recordings add column if not exists recorded_start timestamptz;
alter table meet_recordings add column if not exists recorded_end timestamptz;
