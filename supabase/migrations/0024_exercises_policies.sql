-- exercises/exercise_assignments have had RLS enabled with zero policies
-- since migration 0001 — same scaffolding-only state payroll_entries was
-- in until 0023. First real policies, added alongside the Exercises
-- Library feature (TSS_App_Spec_1.md section 10).

create policy "admins can manage exercises"
  on exercises for all
  using (is_admin())
  with check (is_admin());

-- Coaches need to read the catalog to build the "assign exercise"
-- dropdown, but only admin curates it.
create policy "coaches can view the exercise catalog"
  on exercises for select
  using (exists (select 1 from coaches where profile_id = auth.uid()));

create policy "admins can manage exercise assignments"
  on exercise_assignments for all
  using (is_admin())
  with check (is_admin());

-- A coach assigns exercises only to their own students (same scoping as
-- everything else coach-facing — auth_coach_student_ids()).
create policy "coaches can assign exercises to their own students"
  on exercise_assignments for insert
  with check (
    assigned_by_coach_id = auth_coach_id()
    and student_id in (select auth_coach_student_ids())
  );

create policy "coaches can view assignments for their own students"
  on exercise_assignments for select
  using (student_id in (select auth_coach_student_ids()));

create policy "students can view their own exercise assignments"
  on exercise_assignments for select
  using (student_id = auth_student_id());

-- Master mp3s: a private, service-role-only bucket. No storage.objects
-- policies are added here deliberately — exercises are a shared catalog
-- (many students can share one file), not per-student like
-- chat-attachments, so there's no clean path-based RLS scoping. Instead
-- uploads (admin) and signed-URL reads (student, after their assignment
-- is verified via the RLS-scoped query above) both go through the
-- service-role admin client server-side — see lib/exercises.ts and
-- app/api/admin/exercises/route.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-audio',
  'exercise-audio',
  false,
  52428800, -- 50MB
  array['audio/mpeg', 'audio/mp4', 'audio/wav']
)
on conflict (id) do nothing;
