-- Admins can view and update all entitlements (0005/0007) but there was
-- no delete policy at all, so an admin removing a granted-in-error
-- entitlement (e.g. a trial-lesson perk auto-granted to a migrated Suite
-- student who doesn't need one) would silently 0-row-filter under RLS —
-- same class of gotcha this project has hit before (coach exercise
-- unassign, staff_notes pinning).
drop policy if exists "admins can delete entitlements" on entitlements;
create policy "admins can delete entitlements"
  on entitlements for delete
  using (is_admin());
