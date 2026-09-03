-- Auto-cancelling an understaffed group class (0 or 1 registered student,
-- caught ~24h out by the new group-lesson-understaffed cron) needs
-- somewhere to record why a lesson was cancelled, and a redeemable credit
-- for the one student (if any) who was actually registered and didn't do
-- anything wrong. Modeled on makeup_credits but deliberately a separate
-- table: group lesson registration/billing has always been its own thing
-- (migration 0031's own header comment), and this credit redeems into
-- another group_lessons occurrence of the same topic, not a 1:1 session —
-- makeup_credits' shape (source_session_id, used_session_id, duration
-- matched to a 1:1 booking) doesn't fit that at all.
--
-- Matching "another group class in the same name" (per the studio's own
-- description of this feature) is done purely by comparing `topic` text —
-- a bootcamp series and a regular weekly group class naturally never share
-- a topic string, so nothing extra is needed to keep a credit from one
-- from being redeemed against the other.
alter table group_lessons add column cancel_reason text;

create table group_lesson_credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  topic text not null,
  source_group_lesson_id uuid references group_lessons (id),
  used boolean not null default false,
  used_group_lesson_id uuid references group_lessons (id),
  expires_at timestamptz, -- null = no expiry; this is the studio's fault, not the student's
  reason text,
  created_at timestamptz not null default now()
);

alter table group_lesson_credits enable row level security;

-- Single-table policies only (student_id/auth_student_id(),
-- auth_coach_student_ids(), is_admin() are all SECURITY DEFINER helpers
-- that don't read group_lessons or group_lesson_registrations) — the
-- cross-table recursion class fixed in 0007/0056/0060 can't recur here.
create policy "students can view their own group lesson credits"
  on group_lesson_credits for select
  using (student_id = auth_student_id());

create policy "coaches can view their own students' group lesson credits"
  on group_lesson_credits for select
  using (student_id in (select auth_coach_student_ids()));

create policy "admins can manage group lesson credits"
  on group_lesson_credits for all
  using (is_admin())
  with check (is_admin());

-- No student insert/update policy: the cron that grants these and the
-- student-facing redemption route (app/api/student/group-lessons/
-- redeem-credit) both write through the service-role admin client, after
-- verifying ownership/eligibility in application code — same posture as
-- app/api/shared-folder/notify-upload/route.ts.

alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc',
  'cancel_request',
  'trial_unbooked',
  'credit_expiring',
  'upgraded_suite',
  'upgraded_pro',
  'upgraded_elite',
  'coach_block_added',
  'no_show_1',
  'no_show_2',
  'no_show_3',
  'no_recurring_schedule',
  'hold_ending_soon',
  'inactive_10_days',
  'recording_unmatched',
  'recording_missing',
  'fifth_week_available',
  'group_lesson_understaffed'
));

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'session_starting_soon',
  'session_reminder_24h',
  'recording_ready',
  'makeup_credit_needs_scheduling',
  'weekly_digest',
  'group_lesson_cancelled'
));
