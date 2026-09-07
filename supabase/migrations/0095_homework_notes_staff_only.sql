-- Homework notes were student-facing since 0022 (TSS_App_Spec_1.md
-- section 8) — asked explicitly to flip that: coaches and admin should
-- keep full read access to a student's whole note history, but a
-- student should never be able to read their own homework notes at all
-- anymore. Drops the one policy that granted student SELECT; every
-- coach/admin SELECT and INSERT policy (0022, 0036, 0094) is untouched,
-- since none of them reference the student's own access.
drop policy "students can view their own homework notes" on homework_notes;
