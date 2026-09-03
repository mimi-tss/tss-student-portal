-- A group class's recording needs to reach every registered student's own
-- Drive folder, not just one — the whole matched_student_id/
-- matched_session_id shape (0075/0077) assumes exactly one student per
-- recording, which is wrong for a group lesson by definition. Rather than
-- overload matched_student_id or add a separate join table, this adds one
-- new nullable FK: a group-lesson match points matched_group_lesson_id at
-- the lesson and leaves matched_student_id/matched_session_id both null;
-- who actually got the shortcut is derivable on demand from that lesson's
-- own group_lesson_registrations, the same source of truth the admin
-- group-lessons roster view already uses — no new table needed just to
-- duplicate it.
alter table meet_recordings add column matched_group_lesson_id uuid references group_lessons (id);

alter table meet_recordings drop constraint meet_recordings_match_method_check;
alter table meet_recordings add constraint meet_recordings_match_method_check
  check (match_method in ('day_session', 'name_in_notes', 'manual', 'group_lesson'));
