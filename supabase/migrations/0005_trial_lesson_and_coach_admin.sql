-- Supports the trial-lesson flow (TSS_App_Spec_1.md section 5) and gives
-- coaches/admins the RLS access their dashboards need — neither existed
-- yet since both were placeholder pages until now.

-- Mirrors is_makeup/makeup_credit_id: marks a session as the student's
-- one-time Suite trial lesson, and which entitlement it consumed, so the
-- coach schedule can render it distinctly (visual "coach sale" cue).
alter table sessions add column is_trial boolean not null default false;
alter table sessions add column trial_entitlement_id uuid references entitlements (id);

-- Mirrors makeup_credits.used_session_id: which session actually
-- consumed this entitlement, so it can't be redeemed twice.
alter table entitlements add column used_session_id uuid references sessions (id);

-- Students: needed to check/consume their own trial-lesson entitlement
-- from the booking flow (0003_student_rls_policies.sql covered
-- makeup_credits but missed entitlements).
create policy "students can view their own entitlements"
  on entitlements for select
  using (
    student_id in (select id from students where profile_id = auth.uid())
  );

create policy "students can redeem their own entitlements"
  on entitlements for update
  using (
    student_id in (select id from students where profile_id = auth.uid())
  );

-- Students booking a trial lesson need to see availability for coaches
-- beyond their own assigned one (section 5: trial lesson isn't
-- restricted to assigned_coach_id, since a fresh Suite student may not
-- have one yet). Broadens 0003's assigned-coach-only policies to any
-- coach for SELECT — a student can see any coach's booked/blocked times
-- (needed to compute open slots across all coaches), but still can't
-- book against a coach who isn't theirs or the trial exception.
create policy "students can view all coaches for trial booking"
  on coaches for select
  using (
    exists (select 1 from students where profile_id = auth.uid())
  );

create policy "students can view any coach's blocks for trial booking"
  on coach_blocks for select
  using (
    exists (select 1 from students where profile_id = auth.uid())
  );

create policy "students can view any coach's sessions for trial booking"
  on sessions for select
  using (
    exists (select 1 from students where profile_id = auth.uid())
  );

-- Coaches: can see their own coach row and their own upcoming sessions
-- (never another coach's — enforced here, not just in the UI, per
-- section 8's "never another coach's schedule" rule).
create policy "coaches can view their own coach row"
  on coaches for select
  using (profile_id = auth.uid());

create policy "coaches can view their own sessions"
  on sessions for select
  using (
    actual_coach_id in (select id from coaches where profile_id = auth.uid())
  );

-- Admins: full read/write access across the tables the admin dashboard
-- needs (assigning coaches, booking trial lessons on a student's behalf,
-- ambassador provisioning). Scoped by role, not by ownership, since admin
-- is a global role in this app.
create policy "admins can view all students"
  on students for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can update all students"
  on students for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can view all coaches"
  on coaches for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can view all sessions"
  on sessions for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can insert sessions"
  on sessions for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can view all entitlements"
  on entitlements for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins can update all entitlements"
  on entitlements for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
