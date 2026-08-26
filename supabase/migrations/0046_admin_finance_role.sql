-- Admin-Finance: a superset admin role for whoever handles both
-- operations and money — sees everything a plain "admin" does, PLUS
-- Finance (payroll) and Reports (revenue/margin). A plain "admin" is
-- everyone else with an admin-level Kajabi library card: Overview,
-- Students, Coaches, Needs Review, Community, Exercises, Group Lessons
-- — just not Finance or Reports. Widening is_admin() itself (rather
-- than touching every one of its ~18 policy call sites individually)
-- gives admin_finance the exact same data-level access as admin on
-- every table the *shared* pages already touch; the Finance/Reports-
-- specific boundary is enforced separately, at the application layer
-- (see lib/auth/require-role.ts's requireFinanceAccess for the 2
-- pages, and lib/auth/roles.ts's hasFinanceRole for Finance's own API
-- routes) since RLS alone can't cleanly distinguish "can see a
-- student's homework notes" from "can see a coach's pay rate" without
-- a much bigger policy rewrite than this single-operator internal tool
-- needs.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('student', 'coach', 'admin', 'admin_finance'));

create or replace function is_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'admin_finance')
  )
$$;
