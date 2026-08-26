-- coach_blocks has only ever had SELECT policies (0005/0007/0009) —
-- nothing could actually create a block, so there's been no way to add
-- coach time-off through the app at all. Coaches manage their own
-- blocks (personal time off); admin can manage any coach's.
create policy "coaches can manage their own blocks"
  on coach_blocks for all
  using (coach_id = auth_coach_id())
  with check (coach_id = auth_coach_id());

create policy "admins can manage all blocks"
  on coach_blocks for all
  using (is_admin())
  with check (is_admin());
