-- Admin can already insert sessions (0007) and grant credits (0014), but
-- never had UPDATE on makeup_credits — so booking a session *using* a
-- credit on a student's behalf would insert the session fine but then
-- silently fail to mark the credit as spent. Needed for the new
-- /admin/students/[studentId]/book page.
create policy "admins can update all makeup credits"
  on makeup_credits for update
  using (is_admin());
