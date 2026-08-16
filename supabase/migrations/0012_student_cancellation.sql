-- Self-service cancellation (TSS_App_Spec_1.md section 5/6): a student can
-- flip their own scheduled session to one of the two cancelled statuses,
-- and — if cancelling 24+ hours out — self-issue a capped student-fault
-- makeup credit. See app/api/booking/cancel/route.ts for the flow.

create policy "students can cancel their own scheduled sessions"
  on sessions for update
  using (
    student_id in (select id from students where profile_id = auth.uid())
    and status = 'scheduled'
  )
  with check (
    status in ('cancelled-with-notice', 'cancelled-no-notice')
  );

-- Restricting type to 'student-fault' stops a student from minting the
-- uncapped, non-expiring studio-planned/studio-emergency credit types by
-- calling the API directly. The count subqueries enforce the 1/month,
-- 6/year cap at the DB layer — the primary enforcement, not just the API
-- route's UX messaging — so a direct REST call can't exceed it either.
create policy "students can earn their own student-fault makeup credits"
  on makeup_credits for insert
  with check (
    student_id in (select id from students where profile_id = auth.uid())
    and type = 'student-fault'
    and (
      select count(*) from makeup_credits mc
      where mc.student_id = makeup_credits.student_id
        and mc.type = 'student-fault'
        and mc.created_at >= date_trunc('month', now())
    ) < 1
    and (
      select count(*) from makeup_credits mc
      where mc.student_id = makeup_credits.student_id
        and mc.type = 'student-fault'
        and mc.created_at >= date_trunc('year', now())
    ) < 6
  );
