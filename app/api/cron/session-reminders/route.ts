import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStudent } from "@/lib/notifications/create";

// Every 10 minutes (.github/workflows/session-reminders.yml), catches two
// windows in one run: "starting soon" and "24hr before". Window width
// (10 min) matches the cron cadence so every session is caught exactly
// once as it crosses into the window; notification_log's per-session
// dedup key is the real safety net either way — a slightly-misaligned
// run can never double-send.
//
// Student-only — coaches don't get a Slack ping for these (see
// lib/notifications/session-events.ts for what coaches actually get:
// booked/cancelled events and chat messages, not time-based reminders).
const STARTING_SOON_MIN_MINUTES = 15;
const STARTING_SOON_MAX_MINUTES = 25;
const REMINDER_24H_MIN_HOURS = 23.5;
const REMINDER_24H_MAX_HOURS = 24.5;

interface SessionRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  students:
    | { id: string; email: string; phone: string | null; notify_alerts_email: boolean; notify_alerts_sms: boolean; notify_alerts_inapp: boolean }
    | { id: string; email: string; phone: string | null; notify_alerts_email: boolean; notify_alerts_sms: boolean; notify_alerts_inapp: boolean }[]
    | null;
}

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function sessionsInWindow(admin: ReturnType<typeof createAdminClient>, windowStart: Date, windowEnd: Date) {
  const { data } = await admin
    .from("sessions")
    .select(
      "id, scheduled_at, duration_minutes, " +
        "students(id, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp)",
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart.toISOString())
    .lt("scheduled_at", windowEnd.toISOString());
  return (data ?? []) as unknown as SessionRow[];
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();

  const startingSoon = await sessionsInWindow(
    admin,
    new Date(now + STARTING_SOON_MIN_MINUTES * 60_000),
    new Date(now + STARTING_SOON_MAX_MINUTES * 60_000),
  );
  const reminder24h = await sessionsInWindow(
    admin,
    new Date(now + REMINDER_24H_MIN_HOURS * 60 * 60_000),
    new Date(now + REMINDER_24H_MAX_HOURS * 60 * 60_000),
  );

  let notified = 0;

  for (const [sessions, kind, title, studentBody] of [
    [startingSoon, "session_starting_soon", "Your session starts soon", "Your session starts in about 15-25 minutes."],
    [reminder24h, "session_reminder_24h", "Session tomorrow", "You have a session scheduled in about 24 hours."],
  ] as const) {
    for (const s of sessions) {
      const student = unwrap(s.students);
      if (!student) continue;

      await notifyStudent(admin, {
        studentId: student.id,
        email: student.email,
        phone: student.phone,
        group: "alerts",
        kind,
        dedupKey: `student:${student.id}:${kind}:${s.id}`,
        title,
        body: studentBody,
        linkUrl: "/student/dashboard",
        ghlData: { sessionId: s.id, scheduledAt: s.scheduled_at, durationMinutes: s.duration_minutes },
        channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
      });
      notified++;
    }
  }

  return NextResponse.json({ startingSoon: startingSoon.length, reminder24h: reminder24h.length, notified });
}
