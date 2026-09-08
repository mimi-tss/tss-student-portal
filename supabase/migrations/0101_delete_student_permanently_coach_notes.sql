-- coach_notes (0100) references students(id) with no cascade, same as
-- every other student-scoped table here — delete_student_permanently
-- must delete its rows too or deleting a student who's ever gotten a
-- coach note fails outright on the foreign key. Same signature, so a
-- plain CREATE OR REPLACE (unlike 0098's drop-first case, this one's
-- return type is unchanged).
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
  delete from coach_notes where student_id = p_student_id;
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
