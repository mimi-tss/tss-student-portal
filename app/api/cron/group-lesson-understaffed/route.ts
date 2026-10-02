import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAttentionItem } from "@/lib/admin/attention-items";
import { notifyStudent, notifyCoach } from "@/lib/notifications/create";
import { formatDateTimeInZone } from "@/lib/timezone";
import { groupClassCancelled } from "@/lib/email/templates/group-class-cancelled";
import { cleanGroupTopic } from "@/lib/admin/recording-matching";
import { willAutoCancel } from "@/lib/group-lesson-topic";
import { firstNameOf, lessonTimeFields } from "@/lib/ghl/fields";
import { isCronAuthorized } from "@/lib/cron/auth";

// Catches a group class ~24h out with 0 or 1 registered students and
// cancels it (never a Bootcamp) — a coach showing up to teach one student (or nobody) isn't
// the point of a group class. Same 1-hour window / 15-minute cadence
// posture as session-reminders' own 24h reminder (see that route's
// comment): wide enough to tolerate cron drift, notification_log's
// per-lesson dedup (via group_lessons.cancelled_at itself, checked below,
// plus the notify calls' own dedup) is what actually prevents a
// double-cancel or double-notify, not the window's precision.
const WINDOW_MIN_HOURS = 23.5;
const WINDOW_MAX_HOURS = 24.5;

interface Registration {
  id: string;
  student_id: string;
  status: "registered" | "attended" | "no-show";
  students: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    notify_alerts_email: boolean;
    notify_alerts_sms: boolean;
    notify_alerts_inapp: boolean;
  } | null;
}

interface LessonRow {
  id: string;
  topic: string | null;
  scheduled_at: string;
  coach_id: string;
  cancel_reason: string | null;
  coaches: { name: string; timezone: string; slack_webhook_url: string | null } | { name: string; timezone: string; slack_webhook_url: string | null }[] | null;
  group_lesson_registrations: Registration[] | null;
}

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!isCronAuthorized(authHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now + WINDOW_MIN_HOURS * 60 * 60_000);
  const windowEnd = new Date(now + WINDOW_MAX_HOURS * 60 * 60_000);

  const { data: lessons } = await admin
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, coach_id, cancel_reason, coaches(name, timezone, slack_webhook_url), " +
        "group_lesson_registrations(id, student_id, status, students(id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp))",
    )
    .is("cancelled_at", null)
    .gte("scheduled_at", windowStart.toISOString())
    .lt("scheduled_at", windowEnd.toISOString());

  const rows = (lessons ?? []) as unknown as LessonRow[];
  let cancelled = 0;

  for (const lesson of rows) {
    const registrations = (lesson.group_lesson_registrations ?? []).filter((r) => r.status === "registered");
    // Bootcamps run no matter how many signed up (studio call 2026-09-30).
    if (!willAutoCancel(lesson.topic, registrations.length, lesson.cancel_reason)) continue;

    const coach = unwrap(lesson.coaches);

    const { data: updated } = await admin
      .from("group_lessons")
      .update({
        cancelled_at: new Date().toISOString(),
        cancel_reason: `auto: only ${registrations.length} student${registrations.length === 1 ? "" : "s"} registered`,
      })
      .eq("id", lesson.id)
      .is("cancelled_at", null) // guards against a concurrent run/admin cancel in the same instant
      .select("id");
    if (!updated || updated.length === 0) continue; // already cancelled by another run/admin — skip

    cancelled++;
    const time = coach ? formatDateTimeInZone(lesson.scheduled_at, coach.timezone) : lesson.scheduled_at;
    const topicLabel = lesson.topic?.trim() || "Group Lesson";

    const soleStudent = registrations.length === 1 ? unwrap(registrations[0].students) : null;

    if (soleStudent) {
      if (lesson.topic?.trim()) {
        await admin.from("group_lesson_credits").insert({
          student_id: soleStudent.id,
          topic: lesson.topic,
          source_group_lesson_id: lesson.id,
          reason: "class cancelled — not enough other students registered",
        });
      }

      const when = lessonTimeFields(lesson.scheduled_at, coach?.timezone);
      const rendered = groupClassCancelled({
        firstName: firstNameOf(soleStudent.name),
        coachFirstName: firstNameOf(coach?.name),
        classLabel: cleanGroupTopic(lesson.topic),
        lessonDate: when.lessonDate,
        lessonShortDate: when.lessonShortDate,
        lessonTime: when.lessonTime,
        creditAdded: !!lesson.topic?.trim(),
      });

      await notifyStudent(admin, {
        studentId: soleStudent.id,
        email: soleStudent.email,
        phone: soleStudent.phone,
        group: "alerts",
        kind: "group_lesson_cancelled",
        dedupKey: `student:${soleStudent.id}:group_lesson_cancelled:${lesson.id}`,
        title: rendered.bellTitle,
        body: rendered.bellBody,
        linkUrl: "/student/book",
        ghlData: { groupLessonId: lesson.id, topic: lesson.topic, scheduledAt: lesson.scheduled_at, ...rendered },
        channels: {
          email: soleStudent.notify_alerts_email,
          sms: soleStudent.notify_alerts_sms,
          inApp: soleStudent.notify_alerts_inapp,
        },
      });
    }

    await createAttentionItem(admin, {
      kind: "group_lesson_understaffed",
      studentId: soleStudent?.id,
      coachId: lesson.coach_id,
      summary: soleStudent
        ? `${topicLabel} (${time}) auto-cancelled — only ${soleStudent.name} was registered${lesson.topic?.trim() ? "; credit issued" : "; no topic set, issue credit manually"}`
        : `${topicLabel} (${time}) auto-cancelled — no one was registered`,
    });

    if (coach) {
      await notifyCoach(admin, {
        coachId: lesson.coach_id,
        coachSlackWebhookUrl: coach.slack_webhook_url,
        kind: "group_lesson_cancelled",
        dedupKey: `coach:${lesson.coach_id}:group_lesson_cancelled:${lesson.id}`,
        text: `Group class cancelled (not enough students): ${topicLabel} at ${time}`,
      });
    }
  }

  return NextResponse.json({ checked: rows.length, cancelled });
}
