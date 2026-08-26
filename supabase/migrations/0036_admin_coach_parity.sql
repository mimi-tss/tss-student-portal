-- Admin gets coach-parity on a student's detail view: add homework
-- notes, assign exercises, and send chat messages -- previously admin
-- could only read these, not write them. Admin has no coaches row, so
-- the coach-attribution columns on homework_notes/exercise_assignments
-- become nullable for an admin-authored row (attributed to "Admin" in
-- the UI rather than a specific coach's name).

alter table homework_notes alter column coach_id drop not null;
alter table exercise_assignments alter column assigned_by_coach_id drop not null;

create policy "admins can add homework notes"
  on homework_notes for insert
  with check (is_admin());

-- exercise_assignments already has a for-all "admins can manage exercise
-- assignments" policy (0024) covering insert -- only the nullable column
-- above was blocking it.

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
      )
    )
  );

drop policy "chat participants can upload attachments" on storage.objects;
create policy "chat participants can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (
      is_admin()
      or exists (
        select 1 from chat_threads t
        where t.id::text = (storage.foldername(name))[1]
          and (
            t.student_id in (select id from students where profile_id = auth.uid())
            or t.coach_id = auth_coach_id()
            or t.student_id in (select auth_coach_student_ids())
          )
      )
    )
  );
