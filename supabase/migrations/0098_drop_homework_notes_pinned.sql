-- Asked to remove pinning from homework notes entirely — whichever note
-- is actually newest is always what the student sees on their
-- dashboard spotlight, with no way for an older note to be kept stuck
-- there over a newer one. Redefines student_latest_homework_note()
-- (0096) to order by created_at alone before dropping the column, since
-- the function's own return type references it — Postgres won't let
-- CREATE OR REPLACE change a function's return column set, so the old
-- one has to actually be dropped first.
drop function student_latest_homework_note();

create function student_latest_homework_note()
returns table (id uuid, note text, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, note, created_at
  from homework_notes
  where student_id = auth_student_id()
  order by created_at desc
  limit 1
$$;

alter table homework_notes drop column pinned;
