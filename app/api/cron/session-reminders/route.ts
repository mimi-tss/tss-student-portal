import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStudent } from "@/lib/notifications/create";
import { sendMeetLinkChatReminders } from "@/lib/notifications/meet-link-chat";
import { firstNameOf, lessonTimeFields, portalUrl } from "@/lib/ghl/fields";
import { missedGroupSession, missedLesson } from "@/lib/email/templates/missed-lesson";
import {
  groupSessionReminder24h,
  groupSessionStartingSoon,
  sessionReminder24h,
  sessionStartingSoon,
} from "@/lib/email/templates/session-reminder";
import { cleanGroupTopic } from "@/lib/admin/recording-matching";
import { isCronAuthorized } from "@/lib/cron/auth";
import { willAutoCancel } from "@/lib/group-lesson-topic";

// Every 5 minutes (Supabase pg_cron; GitHub Actions as a slow backup), catches two
// windows in one run: "starting soon" and "24hr before". Window width
// (10 min) matches the cron cadence so every session is caught exactly
// once as it crosses into the window; notification_log's per-session
// dedup key is the real safety net either way — a slightly-misaligned
// run can never double-send.
//
// Student-only — coaches don't get a Slack ping for these (see
// lib/notifications/session-events.ts for what coaches actually get:
// booked/cancelled events and chat messages, not time-based reminders).
// "Starts in 15 minutes" reminder: a 10-minute-wide window centred on 15
// (the cron runs every 10 min), so each lesson is caught once, ~10-20 min
// before it starts.
const STARTING_SOON_MIN_MINUTES = 10;
const STARTING_SOON_MAX_MINUTES = 20;
const REMINDER_24H_MIN_HOURS = 23.5;
const REMINDER_24H_MAX_HOURS = 24.5;

// Matches join-button.tsx's own EARLY_JOIN_MINUTES=10 — the meet-link
// chat message lands the same moment the Join button itself becomes
// clickable, same 10-minute-wide-window-matches-cron-cadence reasoning
// as the two windows above (see sendMeetLinkChatReminders for its own
// dedup, which doesn't use notification_log since this is a real chat
// message, not a notifications-table row).
const MEET_LINK_MIN_MINUTES = 5;
const MEET_LINK_MAX_MINUTES = 15;

interface SessionRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  students:
    | StudentRow
    | StudentRow[]
    | null;
  coaches: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notify_alerts_email: boolean;
  notify_alerts_sms: boolean;
  notify_alerts_inapp: boolean;
}

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function sessionsInWindow(admin: ReturnType<typeof createAdminClient>, windowStart: Date, windowEnd: Date) {
  const { data } = await admin
    .from("sessions")
    .select(
      "id, scheduled_at, duration_minutes, " +
        "students(id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp), " +
        "coaches:actual_coach_id(name, timezone)",
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart.toISOString())
    .lt("scheduled_at", windowEnd.toISOString());
  return (data ?? []) as unknown as SessionRow[];
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!isCronAuthorized(authHeader)) {
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

  for (const [sessions, kind] of [
    [startingSoon, "session_starting_soon"],
    [reminder24h, "session_reminder_24h"],
  ] as const) {
    for (const s of sessions) {
      const student = unwrap(s.students);
      if (!student) continue;
      const coach = unwrap(s.coaches);
      const when = lessonTimeFields(s.scheduled_at, coach?.timezone);

      // Finished email/text (subject + html + sms) go to GHL in ghlData;
      // bell copy mirrors them (lib/email/templates/session-reminder.ts).
      const input = {
        firstName: firstNameOf(student.name),
        coachFirstName: firstNameOf(coach?.name),
        lessonDate: when.lessonDate,
        lessonDay: when.lessonDay,
        lessonTime: when.lessonTime,
        durationMinutes: s.duration_minutes,
      };
      const rendered =
        kind === "session_reminder_24h" ? sessionReminder24h(input) : sessionStartingSoon(input);
      const bell =
        kind === "session_reminder_24h"
          ? {
              title: `Lesson tomorrow with Coach ${firstNameOf(coach?.name)}`,
              body: `${when.lessonDate} · ${when.lessonTime} · ${s.duration_minutes} min`,
            }
          : { title: (rendered as ReturnType<typeof sessionStartingSoon>).bellTitle, body: (rendered as ReturnType<typeof sessionStartingSoon>).bellBody };

      await notifyStudent(admin, {
        studentId: student.id,
        email: student.email,
        phone: student.phone,
        group: "alerts",
        kind,
        dedupKey: `student:${student.id}:${kind}:${s.id}`,
        title: bell.title,
        body: bell.body,
        linkUrl: "/student/dashboard",
        ghlData: {
          sessionId: s.id,
          scheduledAt: s.scheduled_at,
          durationMinutes: s.duration_minutes,
          firstName: firstNameOf(student.name),
          coachName: coach?.name ?? "your coach",
          ...when,
          portalUrl: portalUrl("/student/dashboard"),
          ...rendered,
        },
        channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
      });
      notified++;
    }
  }

  const groupReminded = await sendGroupReminders(admin, now);

  const missedSent = (await sendMissedLessonEmails(admin, now)) + (await sendMissedGroupEmails(admin, now));

  const meetLinksSent = await sendMeetLinkChatReminders(
    admin,
    new Date(now + MEET_LINK_MIN_MINUTES * 60_000),
    new Date(now + MEET_LINK_MAX_MINUTES * 60_000),
  );

  return NextResponse.json({
    startingSoon: startingSoon.length,
    reminder24h: reminder24h.length,
    notified,
    groupReminded,
    meetLinksSent,
    missedSent,
  });
}

// Missed-lesson email, sent only once a session has been marked no-show
// for MISSED_GRACE_MS and is STILL no-show — a coach's mis-click fixed
// within that window (the attendance routes clear no_show_marked_at)
// never reaches the student (studio call 2026-09-28). Looks back 3 days so
// a cron hiccup can't lose one, but never older backlog. Once per session.
const MISSED_GRACE_MS = 2 * 60 * 60 * 1000;
const MISSED_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

async function sendMissedLessonEmails(admin: ReturnType<typeof createAdminClient>, now: number): Promise<number> {
  const { data, error } = await admin
    .from("sessions")
    .select(
      "id, scheduled_at, duration_minutes, no_show_marked_at, " +
        "students(id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp), coaches:actual_coach_id(name, timezone)",
    )
    .eq("status", "no-show")
    .lte("no_show_marked_at", new Date(now - MISSED_GRACE_MS).toISOString())
    .gte("no_show_marked_at", new Date(now - MISSED_LOOKBACK_MS).toISOString());
  if (error) {
    console.error("missed-lesson query failed (migration 0114 applied?)", error.message);
    return 0;
  }

  let sent = 0;
  for (const s of (data ?? []) as unknown as {
    id: string;
    scheduled_at: string;
    duration_minutes: number;
    students: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      notify_alerts_email: boolean;
      notify_alerts_sms: boolean;
      notify_alerts_inapp: boolean;
    } | null;
    coaches: { name: string; timezone: string } | null;
  }[]) {
    const student = unwrap(s.students);
    const coach = unwrap(s.coaches);
    if (!student) continue;
    const when = lessonTimeFields(s.scheduled_at, coach?.timezone);
    const r = missedLesson({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      lessonDate: when.lessonDate,
      lessonDay: when.lessonDay,
      lessonShortDate: when.lessonShortDate,
      lessonTime: when.lessonTime,
      durationMinutes: s.duration_minutes,
    });
    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "session_missed",
      dedupKey: `student:${student.id}:session_missed:${s.id}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { sessionId: s.id, ...r },
      channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
      emailAlways: true, // missed-lesson policy notice: always emailed
    });
    sent++;
  }
  return sent;
}

// Group-session counterpart: same 2-hour grace, "no credit applied"
// message. Quietly does nothing until migration 0115 adds the clock column.
async function sendMissedGroupEmails(admin: ReturnType<typeof createAdminClient>, now: number): Promise<number> {
  const { data, error } = await admin
    .from("group_lesson_registrations")
    .select(
      "id, no_show_marked_at, students(id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp), " +
        "group_lessons(topic, scheduled_at, coaches(name, timezone))",
    )
    .eq("status", "no-show")
    .lte("no_show_marked_at", new Date(now - MISSED_GRACE_MS).toISOString())
    .gte("no_show_marked_at", new Date(now - MISSED_LOOKBACK_MS).toISOString());
  if (error) {
    if (!/no_show_marked_at/.test(error.message)) console.error("missed-group query failed", error.message);
    return 0;
  }

  let sent = 0;
  for (const r of (data ?? []) as unknown as {
    id: string;
    students: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      notify_alerts_email: boolean;
      notify_alerts_sms: boolean;
      notify_alerts_inapp: boolean;
    } | null;
    group_lessons: { topic: string | null; scheduled_at: string; coaches: { name: string; timezone: string } | null } | null;
  }[]) {
    const student = unwrap(r.students);
    const lesson = unwrap(r.group_lessons);
    if (!student || !lesson) continue;
    const coach = unwrap(lesson.coaches);
    const when = lessonTimeFields(lesson.scheduled_at, coach?.timezone);
    const m = missedGroupSession({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      sessionLabel: cleanGroupTopic(lesson.topic),
      lessonDate: when.lessonDate,
      lessonDay: when.lessonDay,
      lessonShortDate: when.lessonShortDate,
      lessonTime: when.lessonTime,
    });
    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "session_missed",
      dedupKey: `student:${student.id}:group_session_missed:${r.id}`,
      title: m.bellTitle,
      body: m.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { registrationId: r.id, ...m },
      channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
      emailAlways: true, // missed-lesson policy notice: always emailed
    });
    sent++;
  }
  return sent;
}

// Group session / Bootcamp reminders (studio call 2026-09-30): same two
// windows and kinds as 1:1, one per registered student, deduped per
// student + group lesson. Cancelled sessions and students who are no
// longer registered get nothing.
async function sendGroupReminders(admin: ReturnType<typeof createAdminClient>, now: number): Promise<number> {
  let sent = 0;
  for (const [kind, from, to] of [
    ["session_starting_soon", STARTING_SOON_MIN_MINUTES * 60_000, STARTING_SOON_MAX_MINUTES * 60_000],
    ["session_reminder_24h", REMINDER_24H_MIN_HOURS * 3_600_000, REMINDER_24H_MAX_HOURS * 3_600_000],
  ] as const) {
    const { data, error } = await admin
      .from("group_lessons")
      .select(
        "id, topic, scheduled_at, duration_minutes, cancelled_at, coaches(name, timezone), " +
          "group_lesson_registrations(status, students(id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp))",
      )
      .is("cancelled_at", null)
      .gte("scheduled_at", new Date(now + from).toISOString())
      .lt("scheduled_at", new Date(now + to).toISOString());
    if (error) {
      console.error("group reminder query failed", error.message);
      continue;
    }
    for (const lesson of (data ?? []) as unknown as {
      id: string;
      topic: string | null;
      scheduled_at: string;
      duration_minutes: number;
      coaches: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
      group_lesson_registrations: { status: string; students: StudentRow | StudentRow[] | null }[];
    }[]) {
      // A class the understaffed job is cancelling in this same 24h window
      // gets the "cancelled" notice instead, never "see you tomorrow".
      const registered = (lesson.group_lesson_registrations ?? []).filter((r) => r.status === "registered");
      if (kind === "session_reminder_24h" && willAutoCancel(lesson.topic, registered.length)) continue;
      const coach = unwrap(lesson.coaches);
      const when = lessonTimeFields(lesson.scheduled_at, coach?.timezone);
      for (const reg of registered) {
        const student = unwrap(reg.students);
        if (!student) continue;
        const input = {
          firstName: firstNameOf(student.name),
          coachFirstName: firstNameOf(coach?.name),
          sessionLabel: cleanGroupTopic(lesson.topic),
          lessonDate: when.lessonDate,
          lessonTime: when.lessonTime,
          durationMinutes: lesson.duration_minutes,
        };
        const r = kind === "session_reminder_24h" ? groupSessionReminder24h(input) : groupSessionStartingSoon(input);
        await notifyStudent(admin, {
          studentId: student.id,
          email: student.email,
          phone: student.phone,
          group: "alerts",
          kind,
          dedupKey: `student:${student.id}:${kind}:group:${lesson.id}`,
          title: r.bellTitle,
          body: r.bellBody,
          linkUrl: "/student/dashboard",
          ghlData: { groupLessonId: lesson.id, scheduledAt: lesson.scheduled_at, ...when, ...r },
          channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
        });
        sent++;
      }
    }
  }
  return sent;
}
