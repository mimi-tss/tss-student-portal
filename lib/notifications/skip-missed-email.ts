import { createAdminClient } from "@/lib/supabase/admin";

// The coach unticked "Send the missed-lesson email" when marking a
// no-show (lib/ui/confirm-no-show.ts). Pre-claims the same
// notification_log dedup key the session-reminders cron uses, so its
// notifyStudent call sees "already sent" and skips. Sticky on purpose:
// re-marking the same lesson later won't send it either.
export async function skipMissedEmail(studentId: string, target: { sessionId: string } | { registrationId: string }) {
  const dedupKey =
    "sessionId" in target
      ? `student:${studentId}:session_missed:${target.sessionId}`
      : `student:${studentId}:group_session_missed:${target.registrationId}`;
  const { error } = await createAdminClient()
    .from("notification_log")
    .insert({ recipient_type: "student", recipient_id: studentId, kind: "session_missed", dedup_key: dedupKey });
  if (error && error.code !== "23505") console.error("skipMissedEmail failed", dedupKey, error.message);
}
