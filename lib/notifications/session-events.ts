import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCoach } from "@/lib/notifications/create";
import { formatDateTimeInZone, formatTimeInZone } from "@/lib/timezone";
import { DAY_NAMES, nextWeeklySlotInstant } from "@/lib/scheduling/recurring";
import { formatPlainDate } from "@/lib/format-date";

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

type RecurringScheduleEventKind = "recurring_schedule_changed" | "recurring_schedule_removed";

// A recurring schedule change quietly materializes or removes many real
// `sessions` rows (materializeRecurringSessions/the recurring-schedule
// DELETE handler), but neither ever told the coach anything happened —
// unlike a one-off booking/cancel, which notifyCoachSessionEvent above
// already covers. One consolidated ping per save/remove, not one per
// materialized occurrence (same "don't spam a coach with 50 identical
// messages" reasoning notifyCoachOfGroupLessonSignup's bulk-register
// path already applies) — a coach doesn't need a play-by-play of every
// individual future Friday, just that the pattern itself changed.
// Never throws, same posture as notifyCoachSessionEvent — a
// notification hiccup must never break saving/removing a real schedule.
export async function notifyCoachRecurringScheduleEvent(opts: {
  coachId: string;
  coachSlackWebhookUrl: string | null;
  coachTimezone: string;
  studentName: string;
  dayOfWeek: number;
  startTime: string;
  startDate: string;
  kind: RecurringScheduleEventKind;
  scheduleId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const instant = nextWeeklySlotInstant(opts.dayOfWeek, opts.startTime, opts.coachTimezone);
    const dayLabel = `${DAY_NAMES[opts.dayOfWeek]}s`;
    const timeLabel = formatTimeInZone(instant, opts.coachTimezone);

    const text =
      opts.kind === "recurring_schedule_removed"
        ? `Weekly schedule removed: ${dayLabel} ${timeLabel} with ${opts.studentName}`
        : `Weekly schedule updated: ${dayLabel} ${timeLabel} with ${opts.studentName}, starting ${formatPlainDate(opts.startDate)}`;

    await notifyCoach(admin, {
      coachId: opts.coachId,
      coachSlackWebhookUrl: opts.coachSlackWebhookUrl,
      kind: opts.kind,
      // Timestamped, not just scheduleId — the same schedule can be
      // legitimately changed (or removed-then-re-added, see that
      // route's own comment) more than once, and each real save should
      // reach Slack, not just the first ever call for that id.
      dedupKey: `coach:${opts.coachId}:${opts.kind}:${opts.scheduleId}:${Date.now()}`,
      text,
    });
  } catch (err) {
    console.error(`notifyCoachRecurringScheduleEvent failed for schedule ${opts.scheduleId} (${opts.kind})`, err);
  }
}
