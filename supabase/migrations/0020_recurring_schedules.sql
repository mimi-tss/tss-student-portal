-- Recurring weekly lesson slot (TSS_App_Spec_1.md sections 4/5). A
-- student's regular lessons are no longer self-booked — admin sets one
-- weekly slot per student and the system materializes real `sessions`
-- rows from it, so everything already built on sessions (coach calendar,
-- attendance marking, payroll, cancellation/credits) keeps working
-- unchanged rather than needing a parallel "virtual session" concept.
--
-- start_time is wall-clock ("16:30") interpreted in the COACH's own
-- timezone, matching how coaches.working_hours is already interpreted —
-- DST-safe because each occurrence is converted per-date via
-- zonedTimeToUtc, not by adding fixed 7-day offsets to an instant.
create table recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) unique,
  coach_id uuid not null references coaches (id),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time text not null,
  duration_minutes integer not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Marks the sessions generated from a schedule, so changing the schedule
-- can clean up its own future occurrences without touching one-off
-- credit bookings or already-attended history.
alter table sessions add column recurring_schedule_id uuid references recurring_schedules (id);

create index sessions_recurring_schedule_id_idx on sessions (recurring_schedule_id);

alter table recurring_schedules enable row level security;

-- Scheduling is admin-only by design (section 5: "Coaches cannot
-- reschedule, cancel, or modify sessions"; students contact the studio
-- to change their weekly time). Students and coaches get read-only
-- visibility of the slot that concerns them.
create policy "admins manage recurring schedules"
  on recurring_schedules for all
  using (is_admin())
  with check (is_admin());

create policy "students view their own recurring schedule"
  on recurring_schedules for select
  using (student_id = auth_student_id());

create policy "coaches view their own students' recurring schedules"
  on recurring_schedules for select
  using (coach_id = auth_coach_id());
