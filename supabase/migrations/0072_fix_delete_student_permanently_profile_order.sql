-- Fixes another real failure from testing 0069: "update or delete on
-- table profiles violates foreign key constraint
-- students_profile_id_fkey on table students" — students.profile_id
-- references profiles(id) (migration 0001), and 0069 deleted profiles
-- BEFORE deleting the students row that still pointed to it. Same class
-- of bug as 0069 itself fixed (backwards delete order), just the one FK
-- that's arguably the most obvious of all of them — the very link
-- between a student and their login — missed because every other fix
-- so far was about a table pointing to sessions/entitlements, not about
-- students' own profile_id.
--
-- Fix is a pure reorder: delete the students row before touching
-- profiles at all, not after. Nothing else references students.id at
-- that point in the function — every table that does has already been
-- deleted earlier in Phase 2.
create or replace function delete_student_permanently(p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  select profile_id into v_profile_id from students where id = p_student_id;

  if not found then
    raise exception 'student not found';
  end if;

  -- Phase 1: null every nullable cross-reference scoped to this
  -- student, so no delete order below can hit a live FK pointing the
  -- "wrong" way.
  update sessions
    set makeup_credit_id = null, trial_entitlement_id = null, recurring_schedule_id = null
    where student_id = p_student_id;
  update makeup_credits
    set source_session_id = null, used_session_id = null
    where student_id = p_student_id;
  update entitlements
    set used_session_id = null
    where student_id = p_student_id;
  update activity_events
    set session_id = null
    where session_id in (select id from sessions where student_id = p_student_id);
  update attention_items
    set request_id = null
    where student_id = p_student_id;

  -- Phase 2: delete everything that references students.id, ending
  -- with the students row itself.
  delete from payroll_entries where session_id in (select id from sessions where student_id = p_student_id);
  delete from recordings where student_id = p_student_id;
  delete from chat_messages where thread_id in (select id from chat_threads where student_id = p_student_id);
  delete from chat_threads where student_id = p_student_id;
  delete from homework_notes where student_id = p_student_id;
  delete from exercise_assignments where student_id = p_student_id;
  delete from admin_overrides where student_id = p_student_id;
  delete from group_lesson_registrations where student_id = p_student_id;
  delete from staff_notes where student_id = p_student_id;
  delete from attention_items where student_id = p_student_id;
  delete from student_requests where student_id = p_student_id;
  delete from magic_link_tokens where student_id = p_student_id;
  delete from recurring_schedules where student_id = p_student_id;
  delete from entitlements where student_id = p_student_id;
  delete from makeup_credits where student_id = p_student_id;
  delete from sessions where student_id = p_student_id;
  delete from students where id = p_student_id;

  -- Phase 3: the student's own profile — only now safe to touch, since
  -- nothing (students included) references it anymore.
  if v_profile_id is not null then
    delete from activity_events where actor_id = v_profile_id;
    update audit_log set actor_id = null where actor_id = v_profile_id;
    delete from profiles where id = v_profile_id;
  end if;

  return v_profile_id;
end;
$$;
