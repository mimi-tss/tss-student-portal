-- Caught by testing the coach dashboard for real: the "coaches can view
-- their own sessions" policy (0005) grants the session row itself, but
-- the nested students(name) join in the coach schedule page needs its
-- own RLS grant on the students table — without it, the join silently
-- resolves to null and the UI falls back to a generic "Student" label.
create policy "coaches can view their own students"
  on students for select
  using (
    id in (
      select student_id from sessions
      where actual_coach_id in (select id from coaches where profile_id = auth.uid())
    )
  );
