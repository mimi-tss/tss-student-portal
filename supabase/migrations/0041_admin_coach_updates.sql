-- coaches has only ever had SELECT policies (0003/0005/0007/0022) — no
-- UPDATE policy at all, for admin or anyone. Needed now that admin can
-- edit a coach's working_hours from the Coaches page; without this the
-- update silently affects zero rows (RLS blocks it, but Supabase's
-- client doesn't surface that as an error) rather than failing loudly.
create policy "admins can update coaches"
  on coaches for update
  using (is_admin())
  with check (is_admin());
