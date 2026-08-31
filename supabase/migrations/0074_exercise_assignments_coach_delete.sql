-- Coaches could assign exercises (0024) but never unassign one — no
-- delete policy existed for them, only the admin "for all" policy.
-- Scoped the same as their existing select policy (their own students,
-- not just assignments they personally made — matches the view scope
-- so a coach can unassign anything showing in their own snapshot,
-- including a pre-existing admin-made assignment).
create policy "coaches can unassign exercises from their own students"
  on exercise_assignments for delete
  using (student_id in (select auth_coach_student_ids()));
