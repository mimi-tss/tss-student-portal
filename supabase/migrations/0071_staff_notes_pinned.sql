-- Lets admin pin a staff note (e.g. sibling/family info worth keeping
-- visible) to the top of the list instead of it getting buried under
-- newer notes — same boolean + double-order pattern homework_notes
-- already uses.
alter table staff_notes add column pinned boolean not null default false;

-- staff_notes (0037) only ever had select/insert policies — no way to
-- update a note (e.g. to pin it) without this. Same gotcha this
-- codebase has hit before: a missing UPDATE policy doesn't error, it
-- just silently matches zero rows under RLS.
create policy "admins can update staff notes"
  on staff_notes for update
  using (is_admin())
  with check (is_admin());
