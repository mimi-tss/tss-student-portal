-- Admin can now change which coach handles a single already-scheduled
-- session (substitute), a student's weekly recurring schedule, or which
-- coach a makeup/credit gets booked with — students and coaches cannot
-- change this themselves (see the new admin-only routes). Whichever
-- coach ends up with a real session (sessions.actual_coach_id) against a
-- student should keep seeing that student the same way any other coach
-- of theirs does — including chat history and homework notes from
-- coaches who had the student before them, not just their own. Chat
-- access was previously scoped to the thread's single *current*
-- coach_id (re-pointed on reassignment, so a swapped-out coach lost
-- access entirely); it's now additive and permanent, matching how
-- auth_coach_student_ids() (0007) already works for `students` itself.

-- homework_notes existed since migration 0001 with RLS enabled but zero
-- policies — deny-all, nothing could read or write it. First real
-- policies for it.
create policy "students can view their own homework notes"
  on homework_notes for select
  using (student_id = auth_student_id());

create policy "coaches can view homework notes for their students"
  on homework_notes for select
  using (
    student_id in (select auth_coach_student_ids())
    or student_id in (select id from students where assigned_coach_id = auth_coach_id())
  );

create policy "coaches can add homework notes for their students"
  on homework_notes for insert
  with check (
    coach_id = auth_coach_id()
    and (
      student_id in (select auth_coach_student_ids())
      or student_id in (select id from students where assigned_coach_id = auth_coach_id())
    )
  );

create policy "admins can view all homework notes"
  on homework_notes for select
  using (is_admin());

-- Widen chat access: a coach who ever had a real session with a student
-- (auth_coach_student_ids(), all-time — not just upcoming/active) keeps
-- permanent read+write access to that student's single chat thread,
-- alongside whoever the thread's *current* coach_id points at. Nobody
-- loses access on reassignment anymore; access only ever accumulates.
drop policy "participants can view their own chat thread" on chat_threads;
create policy "participants can view their own chat thread"
  on chat_threads for select
  using (
    student_id in (select id from students where profile_id = auth.uid())
    or coach_id = auth_coach_id()
    or student_id in (select auth_coach_student_ids())
    or is_admin()
  );

drop policy "participants can view their thread's messages" on chat_messages;
create policy "participants can view their thread's messages"
  on chat_messages for select
  using (
    thread_id in (
      select id from chat_threads
      where student_id in (select id from students where profile_id = auth.uid())
         or coach_id = auth_coach_id()
         or student_id in (select auth_coach_student_ids())
         or is_admin()
    )
  );

drop policy "participants can send messages in their own thread" on chat_messages;
create policy "participants can send messages in their own thread"
  on chat_messages for insert
  with check (
    sender_profile_id = auth.uid()
    and thread_id in (
      select id from chat_threads
      where student_id in (select id from students where profile_id = auth.uid())
         or coach_id = auth_coach_id()
         or student_id in (select auth_coach_student_ids())
    )
  );

drop policy "chat participants can read attachments" on storage.objects;
create policy "chat participants can read attachments"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from chat_threads t
      where t.id::text = (storage.foldername(name))[1]
        and (
          t.student_id in (select id from students where profile_id = auth.uid())
          or t.coach_id = auth_coach_id()
          or t.student_id in (select auth_coach_student_ids())
          or is_admin()
        )
    )
  );

drop policy "chat participants can upload attachments" on storage.objects;
create policy "chat participants can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from chat_threads t
      where t.id::text = (storage.foldername(name))[1]
        and (
          t.student_id in (select id from students where profile_id = auth.uid())
          or t.coach_id = auth_coach_id()
          or t.student_id in (select auth_coach_student_ids())
        )
    )
  );

-- A coach could previously only ever see their own coaches row
-- (0005) — with chat/notes now shared across multiple coaches per
-- student, a coach needs to at least resolve OTHER coaches' names to
-- attribute a previous coach's messages/notes correctly instead of
-- showing "Unknown". Coach names carry no sensitive data (students can
-- already see every coach's name/hours for trial booking, per 0005) so
-- this mirrors that same low-sensitivity grant rather than trying to
-- scope it to "coaches who share a thread with me", which risks the
-- exact policy-recursion problem 0007 already had to fix once.
create policy "coaches can view all coaches"
  on coaches for select
  using (auth_coach_id() is not null);
