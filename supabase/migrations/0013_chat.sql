-- Coach/student chat (TSS_App_Spec_1.md section 9). chat_threads and
-- chat_messages already exist (migration 0001) but had no RLS policies —
-- nothing could read or write them yet.

-- One thread per student, auto-created (or re-pointed to a new coach on
-- reassignment) the moment assigned_coach_id is set — "no manual setup
-- per student" per spec. SECURITY DEFINER so it can write chat_threads
-- regardless of which role's RLS-scoped request triggered the update.
create or replace function create_chat_thread_on_coach_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_coach_id is not null
     and (TG_OP = 'INSERT' or OLD.assigned_coach_id is distinct from NEW.assigned_coach_id) then
    insert into chat_threads (student_id, coach_id)
    values (new.id, new.assigned_coach_id)
    on conflict (student_id) do update set coach_id = excluded.coach_id;
  end if;
  return new;
end;
$$;

create trigger trg_create_chat_thread
after insert or update of assigned_coach_id on students
for each row
execute function create_chat_thread_on_coach_assignment();

-- Backfill: threads for students already assigned a coach before this
-- migration existed.
insert into chat_threads (student_id, coach_id)
select id, assigned_coach_id from students
where assigned_coach_id is not null
on conflict (student_id) do nothing;

-- The existing coach->students SELECT policy (0006) only covers students
-- they've had an actual *session* with — a freshly-assigned student with
-- no sessions yet was invisible to their coach, which would've broken
-- the chat thread picker below (and is arguably a pre-existing gap).
create policy "coaches can view their assigned students"
  on students for select
  using (assigned_coach_id = auth_coach_id());

create policy "participants can view their own chat thread"
  on chat_threads for select
  using (
    student_id in (select id from students where profile_id = auth.uid())
    or coach_id = auth_coach_id()
    or is_admin()
  );

create policy "participants can view their thread's messages"
  on chat_messages for select
  using (
    thread_id in (
      select id from chat_threads
      where student_id in (select id from students where profile_id = auth.uid())
         or coach_id = auth_coach_id()
         or is_admin()
    )
  );

create policy "participants can send messages in their own thread"
  on chat_messages for insert
  with check (
    sender_profile_id = auth.uid()
    and thread_id in (
      select id from chat_threads
      where student_id in (select id from students where profile_id = auth.uid())
         or coach_id = auth_coach_id()
    )
  );

-- Attachments (photos, videos, docs) — private bucket, path convention
-- "{thread_id}/{uuid}-{filename}" so RLS can scope access by thread
-- membership via the first path segment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  52428800, -- 50MB
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'audio/mpeg', 'audio/mp4', 'audio/wav'
  ]
)
on conflict (id) do nothing;

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
          or is_admin()
        )
    )
  );

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
        )
    )
  );
