-- Real gap found while building the coach dashboard's makeup-credits
-- reminder: no coach SELECT policy on makeup_credits has ever existed
-- (0003/0007 only ever granted the student themselves; 0015 granted
-- admin). This silently broke the coach's per-student "Session credits"
-- panel since it was first built in an earlier phase — RLS filtered the
-- query to zero rows instead of erroring, so it always rendered "None
-- available" regardless of the student's real balance.
create policy "coaches can view their own students' makeup credits"
  on makeup_credits for select
  using (student_id in (select auth_coach_student_ids()));
