-- Recurring group lesson series, plus a per-lesson student cap. Group
-- lessons had no recurrence concept at all (every one was a one-off
-- insert — lib/group-lessons.ts's createGroupLesson) and no capacity
-- limit. Modeled as its own table rather than extending
-- recurring_schedules (migration 0020): that table is `unique
-- (student_id)` — one weekly slot per student, which doesn't fit a
-- coach running a group series with many attendees and no natural
-- per-student uniqueness. Unlike recurring_schedules, this has a real
-- end_date — an admin picking a fixed series (e.g. a 6-week workshop)
-- is the normal case here, not the exception.
create table recurring_group_lessons (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id),
  topic text,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time text not null,
  duration_minutes integer not null default 60,
  max_students integer,
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table group_lessons add column max_students integer;
alter table group_lessons add column recurring_group_lesson_id uuid references recurring_group_lessons (id);
create index group_lessons_recurring_group_lesson_id_idx on group_lessons (recurring_group_lesson_id);

alter table recurring_group_lessons enable row level security;

create policy "admins can manage recurring group lessons"
  on recurring_group_lessons for all
  using (is_admin())
  with check (is_admin());

create policy "coaches can view their own recurring group lessons"
  on recurring_group_lessons for select
  using (coach_id = auth_coach_id());
