import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCoach } from "@/lib/notifications/create";
import { formatDateTimeInZone } from "@/lib/timezone";

type SessionEventKind = "session_booked" | "session_cancelled";

const LABEL: Record<SessionEventKind, string> = {
  session_booked: "New session booked",
  session_cancelled: "Session cancelled",
};

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Coach-facing Slack ping for a single booking/cancellation event. A
// reschedule (admin cancel-then-rebook, see admin-cancel-buttons.tsx) is
// deliberately NOT a single combined message — it's two independent HTTP
// requests with no shared server-side context linking them, so it
// naturally shows up here as one "cancelled" + one "booked" call, which
// is an honest account of what happened. Self-contained (own admin
// client, own lookups) so call sites don't need to change their own
// `sessions`/`students` selects just to add this. Never throws — a
// notification hiccup must never break booking/cancelling a real session.
export async function notifyCoachSessionEvent(sessionId: string, kind: SessionEventKind): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: session } = await admin
      .from("sessions")
      .select("id, scheduled_at, actual_coach_id, students(name), coaches(timezone, slack_webhook_url)")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return;

    const student = unwrap(session.students as unknown as { name: string } | { name: string }[] | null);
    const coach = unwrap(
      session.coaches as unknown as
        | { timezone: string; slack_webhook_url: string | null }
        | { timezone: string; slack_webhook_url: string | null }[]
        | null,
    );
    if (!student || !coach || !session.actual_coach_id) return;

    const time = formatDateTimeInZone(session.scheduled_at, coach.timezone);

    await notifyCoach(admin, {
      coachId: session.actual_coach_id,
      coachSlackWebhookUrl: coach.slack_webhook_url,
      kind,
      dedupKey: `coach:${session.actual_coach_id}:${kind}:${sessionId}`,
      text: `${LABEL[kind]}: ${student.name} at ${time}`,
    });
  } catch (err) {
    console.error(`notifyCoachSessionEvent failed for session ${sessionId} (${kind})`, err);
  }
}
