-- Coaches never got a policy granting them their own coach_blocks rows —
-- only "coaches can view their own sessions" and "...coach row" exist so
-- far (0005). Needed for the calendar view to render black break/
-- time-off blocks on a coach's own schedule.
create policy "coaches can view their own blocks"
  on coach_blocks for select
  using (coach_id = auth_coach_id());

-- Admins need to view every coach's blocks too, for the admin calendar
-- view (all coaches, normalized to Eastern display).
create policy "admins can view all blocks"
  on coach_blocks for select
  using (is_admin());
