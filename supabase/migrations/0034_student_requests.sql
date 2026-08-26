-- Self-service cancellation requests (admin Overview's "Needs Attention"
-- queue — Cancel Req rows). Student submits a request; it lands here
-- pending until an admin resolves it.
--
-- Cancel requests don't auto-cancel anything: Kajabi owns real billing
-- and has no cancellation API this app can call (spec section 1), so
-- "approve" just marks it resolved — a to-do for admin to action in
-- Kajabi by the effective date, same "handled off-platform" reality as
-- before, just replacing the phone call with a form + queue instead of
-- silently doing nothing in-app.
--
-- Pause deliberately stays admin-only (decided, not self-service): a
-- student contacts the studio directly and admin registers the hold via
-- the existing admin pause control (app/(admin)/admin/students/[id]/
-- pause-client.tsx) — no student-facing "request a pause" here.
create table student_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  type text not null check (type in ('cancel_subscription')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reason text,
  effective_date date,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles (id),
  admin_note text
);

alter table student_requests enable row level security;

create policy "students can view their own requests"
  on student_requests for select
  using (student_id = auth_student_id());

create policy "students can create their own requests"
  on student_requests for insert
  with check (student_id = auth_student_id());

create policy "admins can manage all requests"
  on student_requests for all
  using (is_admin())
  with check (is_admin());
