-- Group lessons pay the coach too (their teaching time, regardless of
-- how many students showed up) — but payroll_entries.session_id was
-- not-null-references-sessions, and a group lesson has no `sessions`
-- row. Add an alternative reference instead of forcing group lessons
-- into the 1:1 sessions table.
alter table payroll_entries alter column session_id drop not null;
alter table payroll_entries add column group_lesson_id uuid references group_lessons (id);

alter table payroll_entries
  add constraint payroll_entries_session_xor_group_lesson check (
    (session_id is not null and group_lesson_id is null)
    or (session_id is null and group_lesson_id is not null)
  );

-- Same idempotency guarantee generatePayrollRun already relies on for
-- session_id (migration 0023) — a group lesson can't be paid out twice
-- across overlapping admin-run ranges either.
alter table payroll_entries add constraint payroll_entries_group_lesson_id_unique unique (group_lesson_id);
