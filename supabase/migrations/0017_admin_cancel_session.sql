-- Admin could SELECT and INSERT sessions but never had UPDATE at all —
-- needed to cancel a session on a student's behalf (both the regular and
-- staff-cancel paths).
create policy "admins can update all sessions"
  on sessions for update
  using (is_admin());

-- admin_overrides existed since migration 0001 but had zero RLS
-- policies (deny-all) — nothing could read or write it. Needed for the
-- staff-cancel audit trail (spec section 5: "logged with a required
-- note ... for audit trail").
create policy "admins can create overrides"
  on admin_overrides for insert
  with check (is_admin() and admin_profile_id = auth.uid());

create policy "admins can view overrides"
  on admin_overrides for select
  using (is_admin());
