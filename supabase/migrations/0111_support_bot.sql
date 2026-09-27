-- AI help bot + admin takeover (/help, /admin/support). A student or a
-- logged-out guest chats with the bot first; the bot (or the student's
-- "Talk to a person" button) can escalate a thread to a human, at which
-- point the bot goes quiet until admin resolves it or hands it back.
--
-- Separate from chat_threads/chat_messages on purpose: those are the
-- student<->coach conversation and must stay untouched.
--
-- Every read/write goes through server routes with the service-role
-- client (app/api/support/*), after they've verified the caller — a
-- logged-out guest has no auth.uid() for RLS to key on, and the bot's
-- own rows have no sender profile at all. So RLS only needs to let
-- admins read/manage everything directly (the admin inbox pages).

create table support_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students (id) on delete set null,
  profile_id uuid references profiles (id) on delete set null,
  guest_name text,
  guest_email text,
  -- Random secret a logged-out guest's browser holds (cookie + header
  -- fallback for Safari-in-Kajabi-iframe) to keep reading its own thread.
  guest_token text,
  -- bot:         bot is answering
  -- needs_human: escalated, waiting in the queue
  -- claimed:     an admin has picked it up
  -- emailed:     transcript sent to info@ (student chose not to wait, or after hours)
  -- resolved:    closed
  status text not null default 'bot'
    check (status in ('bot', 'needs_human', 'claimed', 'emailed', 'resolved')),
  escalation_reason text,
  escalation_summary text,
  escalated_at timestamptz,
  claimed_by uuid references profiles (id) on delete set null,
  claimed_at timestamptz,
  emailed_at timestamptz,
  resolved_at timestamptz,
  -- Per-thread spend guard (lib/support/bot.ts) + cost visibility.
  bot_turns int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_threads_status_idx on support_threads (status, escalated_at);
create index support_threads_guest_idx on support_threads (guest_token, created_at desc);
create index support_threads_student_idx on support_threads (student_id, created_at desc);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references support_threads (id) on delete cascade,
  sender text not null check (sender in ('student', 'guest', 'bot', 'admin', 'system')),
  sender_profile_id uuid references profiles (id) on delete set null,
  body text,
  -- Path in the private support-attachments bucket.
  attachment_path text,
  -- A pending action the bot proposed (cancel a lesson, change a
  -- notification setting...). Only the student's own Confirm click runs
  -- it — see app/api/support/confirm. Shape: {kind, params, label,
  -- status: 'pending'|'done'|'declined'|'failed', result?}
  action jsonb,
  created_at timestamptz not null default now()
);

create index support_messages_thread_idx on support_messages (thread_id, created_at);

-- Admin-editable help articles, fed whole into the bot's (cached)
-- system prompt. Small studio KB — no search/vector store needed.
create table support_kb_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('portal', 'scheduling', 'kajabi-courses', 'kajabi-community', 'billing', 'login', 'other')),
  title text not null,
  body text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Single-row settings (id = 1).
create table support_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'America/New_York',
  -- {"mon": ["09:00","17:00"], ...}; a missing day = closed.
  office_hours jsonb not null default
    '{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]}',
  -- Shown to a student in the queue: "Can't wait ~N min?"
  expected_wait_minutes int not null default 8,
  support_email text not null default 'info@tarasimonstudios.com',
  updated_at timestamptz not null default now()
);

insert into support_settings (id) values (1) on conflict (id) do nothing;

alter table support_threads enable row level security;
alter table support_messages enable row level security;
alter table support_kb_articles enable row level security;
alter table support_settings enable row level security;

create policy "admins manage support threads" on support_threads for all using (is_admin()) with check (is_admin());
create policy "admins manage support messages" on support_messages for all using (is_admin()) with check (is_admin());
create policy "admins manage support kb" on support_kb_articles for all using (is_admin()) with check (is_admin());
create policy "admins manage support settings" on support_settings for all using (is_admin()) with check (is_admin());

-- Private bucket — service role only; shown via signed URLs.
insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

-- Starter help articles. Edit/extend these in /admin/support/kb — the
-- Kajabi ones especially need the studio's real menu names checked.
insert into support_kb_articles (category, title, body, sort_order) values
('login', 'How logging in works',
 'The portal has no password. Go to the login page, type the email you signed up with, and we email you a 6-digit code. Enter the code within 10 minutes. Each code works once — if it expired or was already used, just request a new one.', 10),
('login', 'Code email never arrived',
 'Check spam/promotions and search your inbox for "Tara Simon Studios". Wait a minute or two, then request a new code. Make sure you typed the same email you used when you signed up (typos and old emails are the most common cause). If it still does not arrive, a person on the team can check your account.', 20),
('login', '"You don''t have permission" / email not found',
 'That message means the email you typed is not on a portal account. Try any other email you might have used to sign up. If none work, a person on the team needs to check your account — escalate.', 30),
('login', 'Logged in but sent back to the login page',
 'Lite members do not have portal access — the portal is part of Suite and up; Lite includes the courses and community in Kajabi. If you are on Suite or higher and keep getting bounced: close the tab, open the portal in a normal browser window (not private mode), and log in again. On iPhone inside the Kajabi app, try opening the portal in Safari directly. If it keeps happening, escalate.', 40),
('scheduling', 'Cancelling or rescheduling a lesson',
 'Your regular weekly lessons are set by the studio. To reschedule, cancel the lesson and then book a make-up with the credit you get. Cancel at least 24 hours before the lesson to earn a make-up credit. Less than 24 hours notice = no credit. Credits expire 30 days after they are created. You can earn up to 1 cancellation credit per month and 6 per year. You can only cancel lessons in your current paid billing period.', 10),
('scheduling', 'Booking a make-up lesson',
 'Open Scheduler in the portal, tick the credit you want to use, and pick an open time with your coach. Booking always uses a credit. If the lesson you book with a credit is cancelled again with 24+ hours notice, the same credit comes back.', 20),
('scheduling', 'Studio holidays',
 'The studio is closed on studio holidays and nothing can be booked those days. If a holiday lands on your regular lesson, it is made up — on the 5th week of the month if there is one, otherwise you get a credit.', 30),
('portal', 'Notification settings',
 'In the portal click your initials (top right) > Account (or go to /billing/account). Under notifications you can turn the Weekly digest and Alerts on or off separately for Email, Text and In-app.', 10),
('portal', 'Chatting with your coach',
 'Use Chat in the portal to message your coach. This help chat is for studio support questions.', 20),
('kajabi-courses', 'Finding your courses',
 'Courses live in Kajabi. In the portal click My Library, or in the Kajabi app open the Library tab. If a course is missing, your plan may not include it — escalate so the team can check your access.', 10),
('kajabi-community', 'Finding the community (Backstage)',
 'The community is called Backstage and lives in Kajabi. In the portal click Backstage, or open the Community tab in the Kajabi app. Lite members get the community too.', 10),
('kajabi-community', 'Community / course notifications',
 'Kajabi community and course notifications are controlled in Kajabi, not the portal: in the Kajabi app open your profile > Settings/Notifications. The portal notification settings only cover lessons, digest and alerts.', 20),
('billing', 'Plan changes, pausing or cancelling',
 'Plan changes, pauses and cancellations are requested in the portal: click your initials (top right) > Billing. The team reviews each request. For billing disputes, refunds or charges you do not recognise, escalate to a person.', 10);
