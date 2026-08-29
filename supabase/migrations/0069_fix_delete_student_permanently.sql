-- Fixes delete_student_permanently() (0068), which failed on a real
-- delete: "update or delete on table entitlements violates foreign key
-- constraint sessions_trial_entitlement_id_fkey" — sessions.trial_entitlement_id
-- (added 0005, for trial-lesson booking) was never nulled before
-- deleting entitlements. Re-auditing every FK into the tables this
-- function touches (not just the one that broke) turned up two more
-- gaps that hadn't triggered yet purely because Postgres stops a
-- transaction at its first violation:
--  - entitlements.used_session_id -> sessions.id (0005) is the OTHER
--    half of a circular reference with sessions.trial_entitlement_id,
--    same shape as the sessions/makeup_credits circularity 0068 already
--    handled — missed because it's a second, separate circular pair,
--    not the same one.
--  - sessions.recurring_schedule_id -> recurring_schedules.id (0020):
--    0068 deleted recurring_schedules BEFORE sessions, backwards — any
--    student with a recurring schedule (i.e. almost every real student)
--    would have hit this next, right after the entitlements fix.
--  - attention_items.request_id -> student_requests.id (0035): 0068
--    deleted student_requests before attention_items, also backwards.
--
-- Restructured into two clean phases instead of patching each
-- discovered gap into the middle of a delete sequence: first null every
-- nullable cross-reference scoped to this student (breaks all circular
-- and ordering dependencies at once), then delete everything with
-- ordering only mattering for genuinely one-directional, NOT NULL
-- references (payroll_entries -> sessions, chat_messages -> chat_threads).
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

  -- Phase 2: delete everything. Order only matters now for the
  -- remaining one-directional, NOT NULL references: payroll_entries and
  -- chat_messages must go before the sessions/chat_threads rows they
  -- point to.
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

  if v_profile_id is not null then
    delete from activity_events where actor_id = v_profile_id;
    update audit_log set actor_id = null where actor_id = v_profile_id;
    delete from profiles where id = v_profile_id;
  end if;

  delete from students where id = p_student_id;

  return v_profile_id;
end;
$$;
