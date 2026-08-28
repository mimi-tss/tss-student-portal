-- Fixes "infinite recursion detected in policy for relation
-- group_lesson_registrations" (Postgres 42P17) — confirmed against
-- production, not theorised: ANY RLS-scoped read of group_lessons or
-- group_lesson_registrations was aborting outright.
--
-- Migration 0031 reintroduced exactly the cycle 0007 was written to
-- eliminate: group_lessons' student policy subqueries
-- group_lesson_registrations, while that table's coach policies
-- subquery group_lessons. Postgres refuses to evaluate either.
--
-- Why this hid for so long: an INSERT only evaluates WITH CHECK
-- (is_admin(), non-recursive), so admin writes succeeded normally while
-- every read silently came back as an error the callers discarded —
-- group lessons never appeared on any coach/admin calendar, the admin
-- "Upcoming group lessons" list stayed empty, and
-- updateRecurringGroupLessonSeries' "delete the empty future
-- occurrences" step read zero rows every time and so deleted nothing,
-- which is why the same occurrence accumulated ~13 duplicate rows.
--
-- Same fix as 0007: SECURITY DEFINER helpers that do the cross-table
-- lookup with RLS bypassed internally, so calling them from the other
-- table's policy can't re-trigger RLS and cycle.

create or replace function auth_student_group_lesson_ids() returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select group_lesson_id from group_lesson_registrations where student_id = auth_student_id()
$$;

create or replace function auth_coach_group_lesson_ids() returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select id from group_lessons where coach_id = auth_coach_id()
$$;

drop policy if exists "students can view group lessons they're registered for" on group_lessons;
create policy "students can view group lessons they're registered for"
  on group_lessons for select
  using (id in (select auth_student_group_lesson_ids()));

drop policy if exists "coaches can view registrations for their own group lessons" on group_lesson_registrations;
create policy "coaches can view registrations for their own group lessons"
  on group_lesson_registrations for select
  using (group_lesson_id in (select auth_coach_group_lesson_ids()));

drop policy if exists "coaches can mark attendance on their own group lesson registrations" on group_lesson_registrations;
create policy "coaches can mark attendance on their own group lesson registrations"
  on group_lesson_registrations for update
  using (group_lesson_id in (select auth_coach_group_lesson_ids()));
