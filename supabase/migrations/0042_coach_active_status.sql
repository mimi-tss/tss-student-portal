-- "Remove a coach" never hard-deletes — sessions/coach_blocks/homework_notes/
-- payroll rows all reference coaches.id with no cascade, and history must
-- survive. active=false instead: drops them from every NEW-assignment
-- picker (assign-coach, provision-student, admin booking) while their past
-- schedule/payroll/notes stay exactly as they were. Distinct from
-- hidden_from_students (0011), which only hides a coach from the student
-- trial-booking picker and says nothing about whether the coach still works
-- here at all.
alter table coaches add column active boolean not null default true;
