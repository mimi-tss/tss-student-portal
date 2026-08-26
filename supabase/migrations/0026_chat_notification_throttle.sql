-- Chat inactive-recipient email notification (TSS_App_Spec_1.md section
-- 9: "generic notification... when a message arrives and the recipient
-- isn't active in-app"). No real presence signal exists anywhere in this
-- app (chat only does 4s polling while mounted) — simplification: throttle
-- to at most one notification email per recipient per thread per 15
-- minutes, tracked per-side since either the student or the coach could
-- be the one messaging. See app/api/chat/messages/route.ts.
alter table chat_threads add column student_last_notified_at timestamptz;
alter table chat_threads add column coach_last_notified_at timestamptz;
