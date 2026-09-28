// Shown before a coach marks a 1:1 lesson no-show — the first guard
// against a mis-click (the second is the email's 2-hour grace period,
// app/api/cron/session-reminders). Studio call 2026-09-28.
export function confirmNoShow(studentName?: string | null): boolean {
  const who = studentName?.trim() || "this student";
  return window.confirm(
    `Mark ${who} as a no-show?\\n\\nThey'll get a missed-lesson email in 2 hours unless you change it back before then.`,
  );
}
