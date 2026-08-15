-- Coaches' one scheduling-adjacent write action (TSS_App_Spec_1.md
-- section 8): marking a session Attended / No-show / Late-forfeit. Only
-- SELECT was ever granted on sessions for coaches (0005) — this adds the
-- UPDATE they need, scoped to their own sessions only.
create policy "coaches can update their own sessions"
  on sessions for update
  using (actual_coach_id = auth_coach_id());
