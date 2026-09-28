// Kill switch for automated student-facing notifications (bell, email via
// Resend, text via GHL — notifyStudent) plus the admin Needs Review nudge
// emails. Was on 2026-09-25 → 2026-09-28 while they were redesigned;
// switched back ON (false) by the studio 2026-09-28. Never covers login
// codes / magic links / welcome emails (students must always be able to
// sign in), the Meet-link chat message, or coach/staff Slack pings. Set to
// true to pause everything again.
export const STUDENT_NOTIFICATIONS_PAUSED = false;
