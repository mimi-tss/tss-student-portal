-- Supports the Kajabi offer restructuring (5 real offers, confirmed via
-- the Kajabi API, not assumed) and Coach Tara's setup:
-- TSS_App_Spec_1.md sections 2, 5, 8.

-- The 60-Minute Session Upgrade add-on (Kajabi offer 2151340474) layers
-- on top of an existing Pro/Elite subscription — it changes how long a
-- student's sessions are, not their tier. Also settable manually by
-- admin for Coach Tara's Stripe-billed students, who never go through
-- this Kajabi offer at all.
alter table students add column session_duration_minutes integer not null default 30;

-- Coach Tara is admin-side only — never offered as a choice in the
-- student-facing trial-lesson coach picker (only admin can assign her,
-- e.g. via the ambassador tool). Master Coaches (Celine/Ivan/Nikki/
-- Crissy) stay visible to students as before.
alter table coaches add column hidden_from_students boolean not null default false;
