-- New notes surface, distinct from both homework_notes (coach/admin
-- write, coach/admin full read, student sees one) and staff_notes
-- (admin-only, never coach or student). Coach notes are readable and
-- writable by a coach or admin, but never by a student at all — not
-- even a single latest one the way homework_notes now exposes (0096).
-- Its own table rather than a visibility flag on an existing one, same
-- reasoning staff_notes (0037) already gave: private-to-a-role content
-- is one policy bug away from leaking if it's just a column on a
-- broader-access table instead of its own RLS surface.
--
-- Access mirrors homework_notes' own three coach-relationship checks
-- (0022 1:1 session history / assigned coach, 0094 group-lesson roster)
-- written as one policy from the start rather than three migrations
-- bolted on incrementally the way homework_notes' history actually
-- went.
create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  coach_id uuid references coaches (id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table coach_notes enable row level security;

create policy "coaches can view coach notes for their students"
  on coach_notes for select
  using (
    student_id in (select auth_coach_student_ids())
    or student_id in (select id from students where assigned_coach_id = auth_coach_id())
    or student_id in (select auth_coach_group_lesson_student_ids())
  );

create policy "coaches can add coach notes for their students"
  on coach_notes for insert
  with check (
    coach_id = auth_coach_id()
    and (
      student_id in (select auth_coach_student_ids())
      or student_id in (select id from students where assigned_coach_id = auth_coach_id())
      or student_id in (select auth_coach_group_lesson_student_ids())
    )
  );

-- Nullable coach_id (same reasoning as homework_notes, 0036) — an
-- admin-authored coach note has no coach row, attributed to "Admin" in
-- the UI.
create policy "admins can view all coach notes"
  on coach_notes for select
  using (is_admin());

create policy "admins can add coach notes"
  on coach_notes for insert
  with check (is_admin());
