-- Fixes "infinite recursion detected in policy for relation
-- makeup_credits" (Postgres 42P17), confirmed against production on
-- the new multi-line "Add credit" form's insert.
--
-- Same root cause class as 0007 (coaches) and 0056 (group_lessons):
-- makeup_credits' student-scoped policies were originally written in
-- 0003 with a raw `student_id in (select id from students where
-- profile_id = auth.uid())` subquery. 0007 replaced them with the
-- auth_student_id() SECURITY DEFINER helper specifically to stop that
-- kind of cross-table policy cycle — but as with group_lessons/0031,
-- there's no guarantee every environment actually carries that fix
-- forward untouched. Rewriting all five current makeup_credits
-- policies here, unconditionally, using only the existing SECURITY
-- DEFINER helpers (auth_student_id(), auth_coach_student_ids(),
-- is_admin()) closes off any raw-subquery drift regardless of which
-- exact version was live. Semantics are unchanged from
-- 0007/0014/0016/0028 combined — this is a repair, not a policy
-- change.

drop policy if exists "students can view their own makeup credits" on makeup_credits;
create policy "students can view their own makeup credits"
  on makeup_credits for select
  using (student_id = auth_student_id());

drop policy if exists "students can redeem their own makeup credits" on makeup_credits;
create policy "students can redeem their own makeup credits"
  on makeup_credits for update
  using (student_id = auth_student_id());

drop policy if exists "coaches can view their own students' makeup credits" on makeup_credits;
create policy "coaches can view their own students' makeup credits"
  on makeup_credits for select
  using (student_id in (select auth_coach_student_ids()));

drop policy if exists "admins can add makeup credits" on makeup_credits;
create policy "admins can add makeup credits"
  on makeup_credits for insert
  with check (is_admin());

drop policy if exists "admins can update all makeup credits" on makeup_credits;
create policy "admins can update all makeup credits"
  on makeup_credits for update
  using (is_admin());
