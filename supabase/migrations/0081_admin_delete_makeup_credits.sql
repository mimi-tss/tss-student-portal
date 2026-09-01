-- Admins can view/insert/update all makeup_credits (0060) but there was
-- no delete policy at all, so an admin removing a wrongly-granted or
-- duplicate unused credit would silently 0-row-filter under RLS — same
-- class of gotcha this project has hit before (coach exercise unassign,
-- staff_notes pinning, entitlements delete in 0079).
drop policy if exists "admins can delete makeup credits" on makeup_credits;
create policy "admins can delete makeup credits"
  on makeup_credits for delete
  using (is_admin());
