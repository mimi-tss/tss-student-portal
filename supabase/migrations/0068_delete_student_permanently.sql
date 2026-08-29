-- Permanent, irreversible student deletion — as opposed to migration
-- 0067's reversible archive flag. A single plpgsql function (not
-- sequential JS deletes from the API route) so the whole thing runs as
-- one real Postgres transaction: if any step fails, everything rolls
-- back and the student row is untouched, rather than risking a
-- half-deleted student with some children gone and others orphaned.
--
-- security definer + an explicit is_admin() check inside the body
-- (rather than trusting the caller's own admin check) — same
-- belt-and-suspenders posture every RLS policy in this schema already
-- takes, since a security definer function bypasses RLS entirely and
-- would otherwise let anyone who can call RPCs delete any student.
--
-- Deletion order handles two real constraints:
--  1. sessions and makeup_credits reference each other
--     (sessions.makeup_credit_id, makeup_credits.source_session_id /
--     used_session_id) — both cross-references are nulled before either
--     table's rows are deleted, or neither could be deleted first.
--  2. activity_events.actor_id is NOT NULL (an event row is immutable
--     by design, migration 0065) — deleting a profile referenced by one
--     would violate that constraint, so this student's own activity
--     events are deleted outright (their login/join-click history is
--     moot once they no longer exist). audit_log.actor_id is nullable
--     ("null = system") so that one is nulled instead of deleted,
--     preserving the audit record itself.
--
-- Returns the deleted student's profile_id (or null if they never had
-- one) so the caller can also remove the actual Supabase auth user —
-- that part needs the service-role admin client, which this
-- database-side function has no access to.
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

  update sessions set makeup_credit_id = null where student_id = p_student_id;
  update makeup_credits set source_session_id = null, used_session_id = null where student_id = p_student_id;
  update activity_events set session_id = null
    where session_id in (select id from sessions where student_id = p_student_id);

  delete from payroll_entries where session_id in (select id from sessions where student_id = p_student_id);
  delete from recordings where student_id = p_student_id;
  delete from chat_messages where thread_id in (select id from chat_threads where student_id = p_student_id);
  delete from chat_threads where student_id = p_student_id;
  delete from homework_notes where student_id = p_student_id;
  delete from exercise_assignments where student_id = p_student_id;
  delete from admin_overrides where student_id = p_student_id;
  delete from group_lesson_registrations where student_id = p_student_id;
  delete from student_requests where student_id = p_student_id;
  delete from staff_notes where student_id = p_student_id;
  delete from attention_items where student_id = p_student_id;
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
