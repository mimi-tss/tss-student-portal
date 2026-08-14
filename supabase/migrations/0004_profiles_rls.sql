-- profiles was created without RLS in 0001_init.sql — closing that gap
-- now that route-group auth gating (lib/auth/require-role.ts) depends on
-- every logged-in user being able to read their own role, and nothing
-- else (without this, any authenticated user could list every profile's
-- role via the default PostgREST grants).
alter table profiles enable row level security;

create policy "users can view their own profile"
  on profiles for select
  using (id = auth.uid());
