-- Students could see their own exercise_assignments rows (0024) but had
-- no SELECT policy on exercises itself, so the nested
-- exercise_assignments -> exercises embed in lib/exercises.ts's
-- listAssignedExercises silently returned null for the embedded row
-- (RLS blocks embedded resources per-row rather than erroring the whole
-- query) — surfaced live as every assigned exercise showing the generic
-- "Exercise" fallback title with no audio. Same missing policy also
-- blocked the exercises.mp3_url lookup in
-- app/api/exercises/[id]/audio/route.ts for a student session, so
-- playback failed too. Mirrors the existing coach catalog-read policy.
create policy "students can view the exercise catalog"
  on exercises for select
  using (exists (select 1 from students where profile_id = auth.uid()));
