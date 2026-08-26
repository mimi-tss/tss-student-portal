-- Manual payroll adjustments — a coach payment not tied to any session
-- or group lesson (a bonus for covering a shift, a deduction, etc).
-- Reuses payroll_entries rather than a parallel table, so Finalized
-- entries/export/mark-paid all keep working for this new row shape
-- too, just as a third mutually-exclusive case alongside
-- session_id/group_lesson_id — `amount` can be negative here (a
-- deduction), unlike session/group-lesson rows which are always
-- positive.
alter table payroll_entries add column is_manual boolean not null default false;
alter table payroll_entries add column reason text;

alter table payroll_entries drop constraint payroll_entries_session_xor_group_lesson;
alter table payroll_entries add constraint payroll_entries_session_xor_group_lesson_xor_manual check (
  (session_id is not null and group_lesson_id is null and not is_manual)
  or (session_id is null and group_lesson_id is not null and not is_manual)
  or (session_id is null and group_lesson_id is null and is_manual)
);
