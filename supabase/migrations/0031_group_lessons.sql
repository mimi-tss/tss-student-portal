-- Group Lessons — structurally different from the 1:1 `sessions` model
-- everything else is built on (attendance, payroll, credits): one lesson
-- has many attendees, is admin-only to create, and its students are
-- billed outside Kajabi via Stripe (same "admin manually confirms
-- payment, then grants access" pattern already used for purchased-addon
-- session credits — migration 0014). Kept as its own pair of tables
-- rather than overloading `sessions.student_id` to be nullable/plural.
create table group_lessons (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id),
  topic text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60, -- "usually 1 hour", admin can override per lesson
  created_at timestamptz not null default now()
);

-- One row per registered student. status mirrors sessions.status'
-- attendance values (a subset — group lessons aren't cancelled/rebooked
-- like a 1:1 session, they're either attended or not by each student).
-- stripe_reference is a free-text note (e.g. a payment/charge id) admin
-- fills in when confirming payment, same posture as purchased-addon
-- credits: no live Stripe integration, no webhook, manual confirmation.
create table group_lesson_registrations (
  id uuid primary key default gen_random_uuid(),
  group_lesson_id uuid not null references group_lessons (id),
  student_id uuid not null references students (id),
  status text not null default 'registered' check (status in ('registered', 'attended', 'no-show')),
  stripe_reference text,
  registered_at timestamptz not null default now(),
  unique (group_lesson_id, student_id)
);

alter table group_lessons enable row level security;
alter table group_lesson_registrations enable row level security;

create policy "admins can manage group lessons"
  on group_lessons for all
  using (is_admin())
  with check (is_admin());

create policy "coaches can view their own group lessons"
  on group_lessons for select
  using (coach_id = auth_coach_id());

create policy "students can view group lessons they're registered for"
  on group_lessons for select
  using (
    id in (select group_lesson_id from group_lesson_registrations where student_id = auth_student_id())
  );

create policy "admins can manage group lesson registrations"
  on group_lesson_registrations for all
  using (is_admin())
  with check (is_admin());

create policy "coaches can view registrations for their own group lessons"
  on group_lesson_registrations for select
  using (
    group_lesson_id in (select id from group_lessons where coach_id = auth_coach_id())
  );

-- Same posture as sessions' "coaches can update their own sessions"
-- (0007) — no column restriction at the RLS layer, the app route only
-- ever sends {status}.
create policy "coaches can mark attendance on their own group lesson registrations"
  on group_lesson_registrations for update
  using (
    group_lesson_id in (select id from group_lessons where coach_id = auth_coach_id())
  );

create policy "students can view their own registrations"
  on group_lesson_registrations for select
  using (student_id = auth_student_id());
