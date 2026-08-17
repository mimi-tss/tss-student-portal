-- Admin could grant makeup credits (0014) but never had SELECT on the
-- table at all — needed for the new admin per-student dashboard view to
-- show a student's actual credit balance.
create policy "admins can view all makeup credits"
  on makeup_credits for select
  using (is_admin());
