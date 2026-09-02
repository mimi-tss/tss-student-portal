import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedYearMonthDay, zonedTimeToUtc } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { notifyStudent, notifyStaff } from "@/lib/notifications/create";
import { getAttentionItems } from "@/lib/admin/attention-items";

export const maxDuration = 60;

// Monday ~8am ET (.github/workflows/weekly-digest.yml, fixed UTC hour —
// same no-DST-awareness precedent as materialize-recurring.yml). Sends
// two things in one run: the student personal digest (email/sms/in-app
// per their own preference) and the staff weekly ops summary (shared
// channel). No coach digest — coaches get event-driven Slack pings
// instead (booked/cancelled, recording ready, chat messages — see
// lib/notifications/session-events.ts and app/api/chat/messages/route.ts),
// not a weekly summary. Both dedup on the same Monday date key, so a
// re-run within the day is a no-op.
function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [y, m, d] = zonedYearMonthDay(new Date(), DEFAULT_TIMEZONE);
  const weekStart = zonedTimeToUtc(y, m, d, 0, 0, DEFAULT_TIMEZONE);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  interface SessionRow {
    id: string;
    student_id: string;
    actual_coach_id: string;
    scheduled_at: string;
    duration_minutes: number;
  }

  function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const row of rows) {
      const k = key(row);
      const list = map.get(k);
      if (list) list.push(row);
      else map.set(k, [row]);
    }
    return map;
  }

  // Bulk-fetched once, grouped in memory — avoids one query per student
  // for what could be 200+ students. Registration/lesson range filtering
  // happens client-side after fetch, not in the query, since PostgREST's
  // dot-path filters on an embedded to-one resource filter which rows of
  // the *embedding* show up, not which parent registrations match —
  // unreliable to lean on here without a live DB to confirm against.
  const [{ data: students }, { data: sessions }, { data: registrations }, { data: credits }] = await Promise.all([
    admin
      .from("students")
      .select("id, name, email, phone, notify_digest_email, notify_digest_sms, notify_digest_inapp")
      .eq("archived", false)
      .neq("tier", "lite"),
    admin
      .from("sessions")
      .select("id, student_id, actual_coach_id, scheduled_at, duration_minutes")
      .eq("status", "scheduled")
      .gte("scheduled_at", weekStart.toISOString())
      .lt("scheduled_at", weekEnd.toISOString())
      .returns<SessionRow[]>(),
    admin.from("group_lesson_registrations").select("student_id, group_lessons(id, scheduled_at, cancelled_at)"),
    admin
      .from("makeup_credits")
      .select("student_id")
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  const sessionsByStudent = groupBy(sessions ?? [], (s) => s.student_id);

  const groupLessonCountByStudent = new Map<string, number>();
  for (const r of registrations ?? []) {
    const lesson = unwrap(
      r.group_lessons as unknown as
        | { id: string; scheduled_at: string; cancelled_at: string | null }
        | { id: string; scheduled_at: string; cancelled_at: string | null }[]
        | null,
    );
    if (!lesson || lesson.cancelled_at) continue;
    const scheduledAt = new Date(lesson.scheduled_at).getTime();
    if (scheduledAt < weekStart.getTime() || scheduledAt >= weekEnd.getTime()) continue;
    groupLessonCountByStudent.set(r.student_id, (groupLessonCountByStudent.get(r.student_id) ?? 0) + 1);
  }

  const creditCountByStudent = new Map<string, number>();
  for (const c of credits ?? []) {
    creditCountByStudent.set(c.student_id, (creditCountByStudent.get(c.student_id) ?? 0) + 1);
  }

  let studentsNotified = 0;
  for (const student of students ?? []) {
    const sessionCount = sessionsByStudent.get(student.id)?.length ?? 0;
    const groupLessonCount = groupLessonCountByStudent.get(student.id) ?? 0;
    const creditCount = creditCountByStudent.get(student.id) ?? 0;

    if (sessionCount === 0 && groupLessonCount === 0 && creditCount === 0) continue; // nothing to say

    const parts: string[] = [];
    if (sessionCount > 0) parts.push(`${sessionCount} session${sessionCount === 1 ? "" : "s"}`);
    if (groupLessonCount > 0) parts.push(`${groupLessonCount} group lesson${groupLessonCount === 1 ? "" : "s"}`);
    if (creditCount > 0) parts.push(`${creditCount} makeup credit${creditCount === 1 ? "" : "s"} available`);

    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "digest",
      kind: "weekly_digest",
      dedupKey: `student:${student.id}:weekly_digest:${weekKey}`,
      title: "Your week ahead",
      body: `This week: ${parts.join(", ")}.`,
      linkUrl: "/student/dashboard",
      ghlData: { sessionCount, groupLessonCount, creditCount, weekStart: weekKey },
      channels: {
        email: student.notify_digest_email,
        sms: student.notify_digest_sms,
        inApp: student.notify_digest_inapp,
      },
    });
    studentsNotified++;
  }

  const backlog = await getAttentionItems(admin, "needs_action");
  const totalSessions = sessions?.length ?? 0;
  const opsText = [
    "*Weekly ops summary*",
    `${totalSessions} sessions scheduled this week`,
    `${backlog.length} item${backlog.length === 1 ? "" : "s"} in Needs Review`,
  ].join("\n");

  await notifyStaff(admin, {
    kind: "weekly_ops_summary",
    dedupKey: `staff:weekly_ops_summary:${weekKey}`,
    text: opsText,
  });

  return NextResponse.json({ studentsNotified, weekKey });
}
