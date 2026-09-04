-- Coach Celine (Slack): "Please add them in my students in the app. I
-- can't send them any message" — her group-class students never showed
-- up in "My Students" and she had no way to chat with them at all.
--
-- Root cause: chat access has only ever been granted two ways —
-- students.assigned_coach_id (the thread's own coach_id) and
-- auth_coach_student_ids() (any coach with a real 1:1 sessions history,
-- added additively in 0022 so reassignment never revokes access). A
-- group-class-only coach relationship (group_lesson_registrations) was
-- never part of either, so a coach teaching a student ONLY in a group
-- class had no path to that student's chat thread at all — RLS simply
-- had no policy admitting them.
--
-- Fix: extends the exact same additive-access pattern 0022 already
-- established, with one more source. All-time (not scoped to "still
-- registered" or "upcoming only"), matching auth_coach_student_ids()'s
-- own all-time posture for the identical reason: a coach who once
-- taught this student in a group class shouldn't lose the ability to
-- see that history just because the class ended.
create or replace function auth_coach_group_lesson_student_ids() returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select distinct glr.student_id
  from group_lesson_registrations glr
  join group_lessons gl on gl.id = glr.group_lesson_id
  where gl.coach_id = auth_coach_id()
$$;

-- Without this, "My Students" would list a group-only student (the
-- lib/coach/dashboard-data.ts fix) but clicking them would show nothing —
-- getStudentSnapshot's own leading `students` SELECT uses the coach's
-- RLS-scoped session client, and neither existing coach policy
-- ("coaches can view their own students", 0007 — 1:1 session history;
-- "coaches can view their assigned students", 0013 — current 1:1
-- assignment) covers a group-lesson-only relationship. Postgres ORs
-- multiple permissive policies together automatically, so this is a
-- pure addition — nothing to drop/replace.
create policy "coaches can view their group lesson students"
  on students for select
  using (id in (select auth_coach_group_lesson_student_ids()));

drop policy "participants can view their own chat thread" on chat_threads;
create policy "participants can view their own chat thread"
  on chat_threads for select
  using (
    student_id in (select id from students where profile_id = auth.uid())
    or coach_id = auth_coach_id()
    or student_id in (select auth_coach_student_ids())
    or student_id in (select auth_coach_group_lesson_student_ids())
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
         or student_id in (select auth_coach_group_lesson_student_ids())
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
         or student_id in (select auth_coach_group_lesson_student_ids())
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
          or t.student_id in (select auth_coach_group_lesson_student_ids())
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
          or t.student_id in (select auth_coach_group_lesson_student_ids())
        )
    )
  );

-- A pure group-class-only student (never had a 1:1 assigned coach) has
-- no chat_threads row at all yet — the only trigger that creates one
-- fires on students.assigned_coach_id (0013). The new broadcast route
-- (app/api/coach/group-lessons/broadcast) creates one lazily the first
-- time a group coach actually messages such a student, same
-- get-or-create posture as everywhere else in this app that seeds a
-- row on first real use rather than pre-provisioning for every
-- registration. Still exactly one thread per student — this migration
-- does not change that; access is additive via the policies above, not
-- via multiple threads.
