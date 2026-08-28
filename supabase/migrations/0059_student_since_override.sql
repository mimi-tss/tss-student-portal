-- "Student since" override, same posture as coach_start_date_override
-- (0029) — for students migrated in (e.g. via CSV bulk import) whose real
-- start date predates their row being created here. Blank falls back to
-- the row's own created_at, same fallback pattern coach_start_date_override
-- uses against "first session with this coach". No new RLS policy needed
-- — "admins can update all students" (0007) already covers it.
alter table students add column student_since_override date;
