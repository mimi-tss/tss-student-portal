-- Confirmed live: a coach picking a group-only student from "My
-- Students" (0092 fixed the visibility) hit "new row violates row-level
-- security policy for table exercise_assignments" trying to assign them
-- an exercise — 0092 only extended chat/students access, not the other
-- coach-facing tables that were flagged as a known follow-up at the
-- time (homework notes, exercise assignment, shared folder).
--
-- exercise_assignments (0024) and homework_notes (0022) both only ever
-- checked auth_coach_student_ids() (1:1 session history) or
-- assigned_coach_id — same gap as chat had, same fix: OR in
-- auth_coach_group_lesson_student_ids() (0092). Postgres ORs multiple
-- permissive policies together automatically, so these are pure
-- additions — nothing to drop/replace.
create policy "coaches can assign exercises to their group lesson students"
  on exercise_assignments for insert
  with check (
    assigned_by_coach_id = auth_coach_id()
    and student_id in (select auth_coach_group_lesson_student_ids())
  );

create policy "coaches can view assignments for their group lesson students"
  on exercise_assignments for select
  using (student_id in (select auth_coach_group_lesson_student_ids()));

create policy "coaches can unassign exercises from their group lesson students"
  on exercise_assignments for delete
  using (student_id in (select auth_coach_group_lesson_student_ids()));

create policy "coaches can view homework notes for their group lesson students"
  on homework_notes for select
  using (student_id in (select auth_coach_group_lesson_student_ids()));

create policy "coaches can add homework notes for their group lesson students"
  on homework_notes for insert
  with check (
    coach_id = auth_coach_id()
    and student_id in (select auth_coach_group_lesson_student_ids())
  );
