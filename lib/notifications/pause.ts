// Kill switch for automated student-facing notifications while they're
// being redesigned (2026-09-25). Covers the in-app bell + GHL email/SMS
// (notifyStudent), the "new message" email to students, and the admin
// Needs Review nudge emails. Deliberately NOT covered: login codes /
// magic links / billing welcome (auth — students must still be able to
// sign in), the Meet-link chat message itself (it's how students join),
// and every coach/staff Slack ping. Flip to false to resume.
export const STUDENT_NOTIFICATIONS_PAUSED = true;
