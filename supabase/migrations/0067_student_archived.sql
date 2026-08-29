-- Reversible "remove from the active list" — as opposed to migration
-- 0068's permanent delete_student_permanently(). Archiving keeps every
-- row (sessions, credits, payroll history) exactly as it is; it only
-- hides the student from the default Students list. Same
-- no-new-RLS-needed posture as students.ambassador (0058) —
-- "admins can update all students" (0007) already covers it.
alter table students add column archived boolean not null default false;
