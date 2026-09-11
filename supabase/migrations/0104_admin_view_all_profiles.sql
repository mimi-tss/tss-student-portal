-- profiles has only ever had "users can view their own profile" (0004) —
-- no admin-wide SELECT policy was ever added, unlike students/coaches.
-- Confirmed live: resolveActorNames (lib/admin/resolve-actor-names.ts),
-- used by the Activity Log's Logins & joins view, reads profiles under
-- the RLS-scoped client to find each actor's role before looking up
-- their name in students/coaches — as admin, that read silently
-- returned nothing for anyone but the admin's own row, so every real
-- login/join-click showed "Unknown" instead of the actual student or
-- coach name, for every admin, always (not a session/cookie bug like
-- today's other reports — a genuine, permanent gap that's been there
-- since 0004).
create policy "admins can view all profiles"
  on profiles for select
  using (is_admin());
