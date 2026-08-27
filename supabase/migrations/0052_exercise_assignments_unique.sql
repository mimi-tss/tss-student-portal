-- Nothing stopped the same exercise being assigned to the same student
-- twice — confirmed live during testing ("2 Note Toggle" assigned
-- twice to one student). Dedupe existing duplicates first (keeps one
-- arbitrary row per pair) since the unique constraint would otherwise
-- fail to apply.
delete from exercise_assignments a using exercise_assignments b
where a.exercise_id = b.exercise_id
  and a.student_id = b.student_id
  and a.id > b.id;

alter table exercise_assignments
  add constraint exercise_assignments_exercise_student_unique
  unique (exercise_id, student_id);
