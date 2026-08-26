-- Internal admin-only notes on a student — distinct from homework_notes,
-- which coaches write and students can see. Staff notes are never
-- visible to a coach or student under any circumstance, so this is a
-- separate table with admin-only RLS rather than a "visibility" flag on
-- homework_notes (that would put private staff content one policy bug
-- away from leaking into a coach- or student-facing query).
create table staff_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table staff_notes enable row level security;

create policy "admins can view staff notes"
  on staff_notes for select
  using (is_admin());

create policy "admins can add staff notes"
  on staff_notes for insert
  with check (is_admin());
