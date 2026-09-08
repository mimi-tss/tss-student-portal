-- 0092 (group-lesson chat access) rewrote "participants can send messages
-- in their own thread" to add auth_coach_group_lesson_student_ids(), but
-- dropped the is_admin() branch that 0036 had put in the SAME policy's
-- thread_id check — the SELECT policies on chat_threads/chat_messages both
-- kept their own is_admin() branch, only this INSERT policy lost it.
-- Confirmed live: admin has been unable to send ANY chat message (to any
-- student, any content) since 0092 shipped on 2026-09-04, reproduced
-- directly against production as a real admin session — every attempt
-- fails with 42501 "new row violates row-level security policy".
drop policy "participants can send messages in their own thread" on chat_messages;
create policy "participants can send messages in their own thread"
  on chat_messages for insert
  with check (
    sender_profile_id = auth.uid()
    and (
      is_admin()
      or thread_id in (
        select id from chat_threads
        where student_id in (select id from students where profile_id = auth.uid())
           or coach_id = auth_coach_id()
           or student_id in (select auth_coach_student_ids())
           or student_id in (select auth_coach_group_lesson_student_ids())
      )
    )
  );
