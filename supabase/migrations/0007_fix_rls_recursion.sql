-- Fixes "infinite recursion detected in policy for relation coaches" —
-- caught via a real coach-login test, not a review. Cross-referencing
-- RLS policies across students/coaches/sessions created a cycle:
-- coaches' policy subqueries students, whose policy (0006) subqueries
-- sessions, whose policy subqueries coaches again. Postgres detects this
-- and refuses to evaluate the query at all.
--
-- Standard fix: SECURITY DEFINER helper functions that look up "my
-- student/coach id" or "am I an admin" by bypassing RLS internally for
-- just that lookup, so calling them from another table's policy never
-- re-triggers RLS on the table being looked up. Breaks every cycle at
-- once instead of patching one at a time.

create or replace function auth_student_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select id from students where profile_id = auth.uid()
$$;

create or replace function auth_coach_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select id from coaches where profile_id = auth.uid()
$$;

create or replace function auth_coach_student_ids() returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select distinct student_id from sessions where actual_coach_id = auth_coach_id()
$$;

create or replace function is_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Drop the narrow assigned-coach-only policies from 0003 outright —
-- 0005's broader "any coach, for trial booking" policies already cover
-- everything they granted, so they're redundant now, not just recursive.
drop policy "students can view their own coach" on coaches;
drop policy "students can view their own coach's blocks" on coach_blocks;
drop policy "students can view sessions involving their own coach" on sessions;

-- Recreate every remaining policy that raw-subqueried students/coaches/
-- profiles from a different table's policy, using the helper functions
-- instead.

drop policy "students can book sessions for themselves" on sessions;
create policy "students can book sessions for themselves"
  on sessions for insert
  with check (student_id = auth_student_id());

drop policy "students can view their own makeup credits" on makeup_credits;
create policy "students can view their own makeup credits"
  on makeup_credits for select
  using (student_id = auth_student_id());

drop policy "students can redeem their own makeup credits" on makeup_credits;
create policy "students can redeem their own makeup credits"
  on makeup_credits for update
  using (student_id = auth_student_id());

drop policy "students can view their own entitlements" on entitlements;
create policy "students can view their own entitlements"
  on entitlements for select
  using (student_id = auth_student_id());

drop policy "students can redeem their own entitlements" on entitlements;
create policy "students can redeem their own entitlements"
  on entitlements for update
  using (student_id = auth_student_id());

drop policy "students can view all coaches for trial booking" on coaches;
create policy "students can view all coaches for trial booking"
  on coaches for select
  using (auth_student_id() is not null);

drop policy "students can view any coach's blocks for trial booking" on coach_blocks;
create policy "students can view any coach's blocks for trial booking"
  on coach_blocks for select
  using (auth_student_id() is not null);

drop policy "students can view any coach's sessions for trial booking" on sessions;
create policy "students can view any coach's sessions for trial booking"
  on sessions for select
  using (auth_student_id() is not null);

drop policy "coaches can view their own sessions" on sessions;
create policy "coaches can view their own sessions"
  on sessions for select
  using (actual_coach_id = auth_coach_id());

drop policy "coaches can view their own students" on students;
create policy "coaches can view their own students"
  on students for select
  using (id in (select auth_coach_student_ids()));

drop policy "admins can view all students" on students;
create policy "admins can view all students"
  on students for select
  using (is_admin());

drop policy "admins can update all students" on students;
create policy "admins can update all students"
  on students for update
  using (is_admin());

drop policy "admins can view all coaches" on coaches;
create policy "admins can view all coaches"
  on coaches for select
  using (is_admin());

drop policy "admins can view all sessions" on sessions;
create policy "admins can view all sessions"
  on sessions for select
  using (is_admin());

drop policy "admins can insert sessions" on sessions;
create policy "admins can insert sessions"
  on sessions for insert
  with check (is_admin());

drop policy "admins can view all entitlements" on entitlements;
create policy "admins can view all entitlements"
  on entitlements for select
  using (is_admin());

drop policy "admins can update all entitlements" on entitlements;
create policy "admins can update all entitlements"
  on entitlements for update
  using (is_admin());
