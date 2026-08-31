-- Adds name-based matching (via each recording's paired Gemini notes
-- doc, which names the student directly) as a second signal alongside
-- the existing same-day+session matching. Needed because day+session
-- matching depends on sessions.status = 'attended' ever being set,
-- which in practice isn't happening yet — name matching doesn't need
-- attendance marked at all, so it can resolve recordings the other
-- path never will.
--
-- matched_student_id is the new source of truth for "who this belongs
-- to" regardless of which path matched it — a name-match may have no
-- specific session to point to (matched_session_id stays null in that
-- case), while a day+session match sets both, since the student is
-- always derivable from the session.
alter table meet_recordings add column matched_student_id uuid references students (id);
alter table meet_recordings add column match_method text check (match_method in ('day_session', 'name_in_notes', 'manual'));
