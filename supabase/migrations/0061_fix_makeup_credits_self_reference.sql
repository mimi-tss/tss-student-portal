-- 0060 rewrote the other four makeup_credits policies but missed the
-- actual cause: 0012's "students can earn their own student-fault
-- makeup credits" INSERT policy checks the 1/month, 6/year cap with a
-- WITH CHECK subquery that reads makeup_credits itself:
--
--   select count(*) from makeup_credits mc where mc.student_id = ...
--
-- Postgres flags a policy on relation R that subqueries R again as
-- recursive at plan time — for ALL permissive policies combined on an
-- INSERT, not conditionally on whether the row actually matches
-- type = 'student-fault'. That's why an admin inserting a
-- 'purchased-addon' row still hit "infinite recursion detected in
-- policy for relation makeup_credits": this policy still has to be
-- combined into the same INSERT check.
--
-- Same fix as everywhere else in this file: move the self-count into a
-- SECURITY DEFINER function so it bypasses RLS on its own internal
-- read instead of re-triggering makeup_credits' policies.

create or replace function auth_student_fault_credit_count(p_student_id uuid, p_since timestamptz)
returns bigint
language sql security definer stable
set search_path = public
as $$
  select count(*) from makeup_credits
  where student_id = p_student_id
    and type = 'student-fault'
    and created_at >= p_since
$$;

drop policy if exists "students can earn their own student-fault makeup credits" on makeup_credits;
create policy "students can earn their own student-fault makeup credits"
  on makeup_credits for insert
  with check (
    student_id = auth_student_id()
    and type = 'student-fault'
    and auth_student_fault_credit_count(student_id, date_trunc('month', now())) < 1
    and auth_student_fault_credit_count(student_id, date_trunc('year', now())) < 6
  );
