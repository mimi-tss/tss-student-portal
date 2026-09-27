-- "This week in Backstage" blurb for the Monday student digest. The
-- community lives on Kajabi, whose API has no community endpoints, so the
-- studio types 1-3 lines per week in the admin Backstage page instead.
-- One row per digest week (week_start = that Monday, the digest's own
-- weekKey). No row / blank body = the digest shows the fixed "join the
-- conversation" invite line.
create table digest_community_notes (
  week_start date primary key,
  body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

alter table digest_community_notes enable row level security;

create policy "admins manage digest community notes"
  on digest_community_notes for all
  using (is_admin())
  with check (is_admin());
