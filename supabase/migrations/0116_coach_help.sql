-- Mel for coaches + a private coach help center (/coach/help).
--
-- Each help article now has an audience: students (the public /help
-- center + Mel for students/guests), coaches (only logged-in coaches see
-- it, in /coach/help, and only coach chats with Mel use it), or both.
-- Coach articles are never shown on the public /help, whatever
-- is_public says.

alter table support_kb_articles
  add column audience text not null default 'students'
    check (audience in ('students', 'coaches', 'both'));

-- Coach-portal categories alongside the student ones.
alter table support_kb_articles drop constraint support_kb_articles_category_check;
alter table support_kb_articles add constraint support_kb_articles_category_check
  check (category in (
    'portal', 'scheduling', 'kajabi-courses', 'kajabi-community', 'billing', 'login', 'other',
    'coach-schedule', 'coach-students', 'coach-lessons', 'coach-pay'
  ));

-- Logging in works the same for everyone.
update support_kb_articles set audience = 'both'
where slug in ('how-logging-in-works', 'code-email-never-arrived');

-- Coach chats: which coach started the thread (student_id stays null).
alter table support_threads
  add column coach_id uuid references coaches (id) on delete set null;

create index support_threads_coach_idx on support_threads (coach_id, created_at desc);

-- Coaches' own messages in their chats with Mel.
alter table support_messages drop constraint support_messages_sender_check;
alter table support_messages add constraint support_messages_sender_check
  check (sender in ('student', 'coach', 'guest', 'bot', 'admin', 'system'));
