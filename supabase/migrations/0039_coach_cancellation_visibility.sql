-- Coaches can now see when one of their own students has a pending or
-- approved cancellation flagged (getStudentSnapshot's new
-- cancellationFlag, lib/coach/dashboard-data.ts) — so they have a
-- chance to try to retain the student too, not just admin. student_
-- requests (0034) only had a student-select-own and an admin-manage-all
-- policy; this adds the coach one, same dual condition homework_notes
-- already uses for coach access (0022) — auth_coach_student_ids() (any
-- coach who's ever had a real session with them) or the student's
-- current assigned_coach_id (a freshly-assigned student with no
-- sessions yet).
create policy "coaches can view cancellation requests for their own students"
  on student_requests for select
  using (
    student_id in (select auth_coach_student_ids())
    or student_id in (select id from students where assigned_coach_id = auth_coach_id())
  );
