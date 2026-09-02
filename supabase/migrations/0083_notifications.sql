-- Notifications: weekly digest + alert-style pings (session-starting-soon,
-- 24hr reminder, recording-ready, makeup-credit-needs-scheduling) for
-- students, plus Slack pings for coaches (their own per-coach channel) and
-- staff (shared ops channel). Students get email/SMS via a GHL webhook
-- (lib/ghl/notify.ts) — Resend stays untouched, magic-link/login-code auth
-- email only. In-app is native since GHL can't write into this app.
--
-- Two independently-toggleable groups per student, per the studio's own
-- split: "digest" (weekly summary) and "alerts" (everything else).

alter table students
  add column notify_digest_email boolean not null default true,
  add column notify_digest_sms   boolean not null default false,
  add column notify_digest_inapp boolean not null default true,
  add column notify_alerts_email boolean not null default true,
  add column notify_alerts_sms   boolean not null default false,
  add column notify_alerts_inapp boolean not null default true;

-- Nullable — a coach with no channel set simply gets no Slack pings
-- (lib/slack/notify.ts skips silently rather than falling back to the
-- shared staff channel, so an unconfigured coach's notifications never
-- land somewhere wrong). Admin-settable from the coach edit panel.
alter table coaches
  add column slack_webhook_url text;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  group_key text not null check (group_key in ('digest', 'alerts')),
  kind text not null check (kind in (
    'session_starting_soon',
    'session_reminder_24h',
    'recording_ready',
    'makeup_credit_needs_scheduling',
    'weekly_digest'
  )),
  title text not null,
  body text not null,
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_student_unread_idx
  on notifications (student_id, created_at desc)
  where read_at is null;

alter table notifications enable row level security;

create policy "students can view their own notifications"
  on notifications for select
  using (student_id = auth_student_id());

create policy "students can mark their own notifications read"
  on notifications for update
  using (student_id = auth_student_id())
  with check (student_id = auth_student_id());

-- No insert policy for students — every row is written by the service-role
-- admin client (cron routes / event hooks), same posture as attention_items.

-- Dedup/audit log for every automated send, any channel, any recipient
-- type — this app had no delivery log anywhere before this. dedup_key
-- already encodes the full identity (recipient + event + occurrence,
-- e.g. "student:<id>:session_reminder_24h:<sessionId>"), so this is a
-- PLAIN (non-partial) unique constraint: no WHERE predicate, so — unlike
-- attention_items (see 0082's header comment) — a plain
-- .insert(...).select().single() from supabase-js works fine; catch the
-- unique-violation (23505) to mean "already sent" and skip. No RPC needed.
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('student', 'coach', 'staff')),
  recipient_id uuid,
  kind text not null,
  dedup_key text not null,
  sent_at timestamptz not null default now(),
  unique (kind, dedup_key)
);

alter table notification_log enable row level security;

create policy "admins can view notification log"
  on notification_log for select
  using (is_admin());

-- No insert/update/delete policy — written only by the service-role
-- admin client.
