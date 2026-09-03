-- Fixes a real "canceling statement due to statement timeout" a coach
-- hit repeatedly trying to send a chat message — Postgres's own raw
-- error text, surfaced straight to the UI (a separate, smaller UI fix is
-- needed for that too, but this is the actual root cause).
--
-- auth_student_id()/auth_coach_id()/auth_coach_student_ids() (migration
-- 0007) are the security-definer helpers nearly every RLS policy in this
-- app calls, including chat_messages' own insert policy
-- (0013/0022/0036) — and every one of them filters on a foreign-key
-- column that has never had an index in this app's entire migration
-- history: students.profile_id, coaches.profile_id,
-- sessions.actual_coach_id. Confirmed via `grep -n "^create index"
-- across every migration — none of these three (or chat_threads'/
-- chat_messages' own FK columns) were ever indexed. Postgres does NOT
-- auto-index a foreign-key column the way it does a primary key, so
-- every single RLS check on nearly every table has been sequentially
-- scanning the FULL sessions table (auth_coach_student_ids —
-- "select distinct student_id from sessions where actual_coach_id =
-- ...") this whole time. Sessions rows keep growing via nightly
-- recurring materialization (WEEKS_AHEAD horizon x every active
-- schedule), so this was always going to get slower, not stay flat —
-- consistent with a report that "keeps happening" rather than being a
-- one-off. Chat's own insert policy additionally subqueries
-- chat_threads (unindexed student_id/coach_id) and re-subqueries
-- students by profile_id for every row, compounding it further right
-- where the report happened.
--
-- Purely additive — an index changes query plans, never query results,
-- so this can't change any existing behavior, only speed it up.

create index students_profile_id_idx on students (profile_id);
create index coaches_profile_id_idx on coaches (profile_id);
create index sessions_actual_coach_id_idx on sessions (actual_coach_id);
create index sessions_student_id_idx on sessions (student_id);
create index chat_threads_student_id_idx on chat_threads (student_id);
create index chat_threads_coach_id_idx on chat_threads (coach_id);
create index chat_messages_thread_id_idx on chat_messages (thread_id);
