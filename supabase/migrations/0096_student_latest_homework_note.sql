-- Follow-up to 0095: a student should see their single most recent
-- homework note (pinned first, matching the old dashboard "spotlight"
-- ordering) but not the full past history. A plain RLS policy can't
-- express "only the newest row" — USING runs per-row with no ORDER
-- BY/LIMIT — so a broad re-opened SELECT policy would let a student
-- read every note again, right back to where 0095 started. Instead,
-- a narrow security-definer function (same bypass-RLS-internally
-- pattern as auth_student_id()/auth_coach_id(), 0007) that only ever
-- returns one row, scoped to the calling student's own id. RLS itself
-- stays exactly as 0095 left it — no student SELECT policy on
-- homework_notes at all — so this is the only path a student has to
-- read any note, and it's capped at one by construction.
create or replace function student_latest_homework_note()
returns table (id uuid, note text, pinned boolean, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, note, pinned, created_at
  from homework_notes
  where student_id = auth_student_id()
  order by pinned desc, created_at desc
  limit 1
$$;
