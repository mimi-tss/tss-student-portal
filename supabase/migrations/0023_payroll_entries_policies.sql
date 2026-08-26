-- payroll_entries has existed since migration 0001 with RLS enabled but
-- zero policies — deny-all, nothing could read or write it. First real
-- policies, added alongside lib/payroll/calculate.ts (the first code
-- that touches this table). See TSS_App_Spec_1.md section 6.

-- A session should never be paid out twice across two overlapping
-- admin-run date ranges — generatePayrollRun() relies on this to make
-- re-running a range idempotent (upsert ... ignoreDuplicates).
alter table payroll_entries
  add constraint payroll_entries_session_id_unique unique (session_id);

create policy "admins can manage all payroll entries"
  on payroll_entries for all
  using (is_admin())
  with check (is_admin());

-- Coaches see their own finalized pay history only — read-only, no
-- insert/update policy, since generating a run and marking paid are
-- admin-only actions (spec section 8: "own payroll summary").
create policy "coaches can view their own payroll entries"
  on payroll_entries for select
  using (coach_id = auth_coach_id());
