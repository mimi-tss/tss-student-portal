-- Studio-written content for the Monday student digest (admin → Weekly
-- Email). Two kinds:
--
--   digest_features — up to 2 boxes per digest week (week_start = that
--     Monday, the digest's own weekKey). Every field is optional; an
--     empty field just isn't shown, and a box with nothing in it is
--     skipped. A button needs both a label and a link.
--
--   digest_events — the standing "What's Coming Up" list. Not per week:
--     each digest shows every event dated on/after its Monday, so past
--     ones drop off on their own.
--
-- Images live in a PUBLIC storage bucket because email clients load them
-- straight from the URL (no signed links).

drop table if exists digest_community_notes; -- earlier draft of this migration

create table digest_features (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  position smallint not null check (position in (1, 2)),
  heading text,
  body text,
  image_url text,
  button_label text,
  button_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (week_start, position)
);

create table digest_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index digest_events_date_idx on digest_events (event_date);

alter table digest_features enable row level security;
alter table digest_events enable row level security;

create policy "admins manage digest features" on digest_features for all using (is_admin()) with check (is_admin());
create policy "admins manage digest events" on digest_events for all using (is_admin()) with check (is_admin());

insert into storage.buckets (id, name, public)
values ('digest-images', 'digest-images', true)
on conflict (id) do nothing;
