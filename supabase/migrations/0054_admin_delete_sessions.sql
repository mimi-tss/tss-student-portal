-- sessions has SELECT/INSERT/UPDATE policies for admin (0005/0007/0017)
-- but no DELETE policy at all, for any role — RLS defaults to deny when
-- nothing matches, so every existing `.delete()` call against sessions
-- (app/api/admin/recurring-schedule/route.ts's cleanup step, both on
-- schedule change and on removing a schedule entirely) has been
-- silently affecting zero rows the whole time. Supabase's client
-- doesn't surface a blocked delete as an error (same gotcha 0041's own
-- comment already flagged for UPDATE) — the old future occurrences of a
-- changed/removed recurring schedule were never actually being deleted,
-- just left to coexist with the newly generated ones. This is what
-- produced the "duplicate on the coach schedule" bug: change a
-- student's weekly slot, then change it again, and the old day's
-- session never went away.
create policy "admins can delete sessions"
  on sessions for delete
  using (is_admin());
