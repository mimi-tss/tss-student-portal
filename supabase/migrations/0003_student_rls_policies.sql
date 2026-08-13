-- Minimal RLS policies so the student-facing booking flow
-- (app/(student)/student/book) works under the logged-in user's own
-- session, without needing the service-role client. RLS was enabled with
-- no policies in 0001_init.sql (deny-all); this adds just enough read/write
-- access for a student to see their own coach's open slots and book one.
-- Coach- and admin-side policies are not yet defined — add alongside those
-- portals' actual implementation.

create policy "students can view own row"
  on students for select
  using (profile_id = auth.uid());

create policy "students can view their own coach"
  on coaches for select
  using (
    id in (select assigned_coach_id from students where profile_id = auth.uid())
  );

create policy "students can view their own coach's blocks"
  on coach_blocks for select
  using (
    coach_id in (select assigned_coach_id from students where profile_id = auth.uid())
  );

create policy "students can view sessions involving their own coach"
  on sessions for select
  using (
    actual_coach_id in (select assigned_coach_id from students where profile_id = auth.uid())
    or student_id in (select id from students where profile_id = auth.uid())
  );

create policy "students can book sessions for themselves"
  on sessions for insert
  with check (
    student_id in (select id from students where profile_id = auth.uid())
  );

create policy "students can view their own makeup credits"
  on makeup_credits for select
  using (
    student_id in (select id from students where profile_id = auth.uid())
  );

create policy "students can redeem their own makeup credits"
  on makeup_credits for update
  using (
    student_id in (select id from students where profile_id = auth.uid())
  );
