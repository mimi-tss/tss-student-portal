-- Lightweight event log for things that aren't a row diff: logins and
-- "did the student actually click Join session". Inserted directly by
-- app code (the RLS-scoped client, right after the event happens), not
-- captured by a trigger — unlike audit_log there's no source table to
-- attach one to.
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('login', 'join_click')),
  actor_id uuid not null references profiles (id),
  method text, -- login only: 'magic_link' | 'login_code'
  session_id uuid references sessions (id), -- join_click only
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index activity_events_actor_id_idx on activity_events (actor_id);
create index activity_events_event_type_idx on activity_events (event_type);
create index activity_events_occurred_at_idx on activity_events (occurred_at desc);

alter table activity_events enable row level security;

create policy "admins can view activity events"
  on activity_events for select
  using (is_admin());

-- Any logged-in user may log their OWN event — occurred_at is
-- server-clock (default now()), not client-supplied, so it can't be
-- backdated; actor_id is pinned to auth.uid() so nobody can log an
-- event as someone else. No update/delete policy — an event row is
-- immutable once written, which matters given this table's whole
-- purpose is dispute evidence.
create policy "users can log their own activity event"
  on activity_events for insert
  with check (actor_id = auth.uid());
