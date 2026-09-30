-- Mel chat wrap-up: star ratings, who/what closed a chat, and a cap on
-- account look-ups for logged-out visitors.

alter table support_threads
  -- 1-5 stars the student/guest gave after the chat closed.
  add column rating smallint check (rating between 1 and 5),
  add column rated_at timestamptz,
  -- 'student' (said it was solved), 'admin' (Resolve button),
  -- 'auto' (no reply for 5 minutes while Mel was waiting).
  add column resolved_by text check (resolved_by in ('student', 'admin', 'auto')),
  -- Guest "what email did you sign up with?" checks (lookup_account tool);
  -- capped per chat so the chat can't be used to probe emails.
  add column account_lookups int not null default 0;
