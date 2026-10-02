import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUnscheduledMakeupCredits, type UnscheduledCredit } from "@/lib/makeup-credits/unscheduled";
import { notifyStudent } from "@/lib/notifications/create";
import { STUDENT_NOTIFICATIONS_PAUSED } from "@/lib/notifications/pause";
import { lessonCredits } from "@/lib/email/templates/lesson-credits";
import { firstNameOf, lessonTimeFields } from "@/lib/ghl/fields";
import { groupCredits, type GroupCreditLine } from "@/lib/email/templates/group-credits";
import { getRedeemableGroupLessons } from "@/lib/group-lesson-credits";
import { isBootcamp } from "@/lib/group-lesson-topic";
import { cleanGroupTopic } from "@/lib/admin/recording-matching";

// Daily lesson-credit reminders (.github/workflows/makeup-nudges.yml),
// ONE email per student covering all their unbooked credits — never one
// per credit (studio call 2026-09-26). Two triggers, each at most once per
// credit (per-credit notification_log rows):
//   - "new": a credit 3–14 days old that hasn't been nudged yet. The
//     14-day cap keeps the first run after the notification pause from
//     nudging months-old credits — those get the expiry reminder instead.
//   - "expiring": a credit expiring within 7 days that hasn't had its
//     expiry reminder yet. Wins over "new" if both apply in one run.
// Expired credits are excluded upstream (getUnscheduledMakeupCredits).
// Email, text and bell each follow the student's Alerts settings.
const NEW_MAX_AGE_DAYS = 14;
const EXPIRING_WITHIN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const newKey = (c: UnscheduledCredit) => `student:${c.studentId}:makeup_nudge:${c.id}`;
const expiringKey = (c: UnscheduledCredit) => `student:${c.studentId}:makeup_expiring:${c.id}`;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Checked here, not just inside notifyStudent: this route marks credits
  // as reminded itself, and must not do that while nothing actually sends.
  if (STUDENT_NOTIFICATIONS_PAUSED) {
    return NextResponse.json({ paused: true });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const credits = await getUnscheduledMakeupCredits(admin);

  const { data: sentRows } = await admin
    .from("notification_log")
    .select("dedup_key")
    .in("kind", ["makeup_credit_needs_scheduling", "makeup_credit_expiring"])
    .like("dedup_key", "student:%");
  const sent = new Set((sentRows ?? []).map((r) => r.dedup_key as string));

  const byStudent = new Map<string, UnscheduledCredit[]>();
  for (const c of credits) byStudent.set(c.studentId, [...(byStudent.get(c.studentId) ?? []), c]);

  const { data: students } = await admin
    .from("students")
    .select("id, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp")
    .in("id", [...byStudent.keys()]);
  const prefsById = new Map((students ?? []).map((s) => [s.id as string, s]));

  let notified = 0;
  for (const [studentId, all] of byStudent) {
    const prefs = prefsById.get(studentId);
    if (!prefs) continue;

    const expiringNow = all.filter(
      (c) => c.expiresAt && new Date(c.expiresAt).getTime() - now <= EXPIRING_WITHIN_DAYS * DAY_MS && !sent.has(expiringKey(c)),
    );
    const freshNow = all.filter(
      (c) => now - new Date(c.createdAt).getTime() <= NEW_MAX_AGE_DAYS * DAY_MS && !sent.has(newKey(c)),
    );
    const expiring = expiringNow.length > 0;
    if (!expiring && freshNow.length === 0) continue;

    // The email lists every unbooked credit they hold, not just the one
    // that triggered it — the student wants the full picture.
    const rendered = lessonCredits({
      firstName: firstNameOf(all[0].studentName),
      credits: all.map((c) => ({ durationMinutes: c.durationMinutes, expiresAt: c.expiresAt })),
      expiring,
    });
    const triggering = expiring ? expiringNow : freshNow;
    const kind = expiring ? "makeup_credit_expiring" : "makeup_credit_needs_scheduling";

    await notifyStudent(admin, {
      studentId,
      email: all[0].studentEmail,
      phone: all[0].studentPhone,
      group: "alerts",
      kind: "makeup_credit_needs_scheduling",
      dedupKey: `student:${studentId}:${kind}:${triggering.map((c) => c.id).sort().join(",")}`,
      title: rendered.bellTitle,
      body: rendered.bellBody,
      linkUrl: "/student/book",
      ghlData: { ...rendered, reminder: expiring ? "expiring" : "new", creditCount: all.length },
      channels: { email: prefs.notify_alerts_email, sms: prefs.notify_alerts_sms, inApp: prefs.notify_alerts_inapp },
    });

    // Per-credit markers so each credit gets each reminder at most once.
    // An expiry reminder also covers the "new" nudge for those credits.
    const markers = [
      ...triggering.map((c) => ({ key: expiring ? expiringKey(c) : newKey(c), kind })),
      ...(expiring ? freshNow.map((c) => ({ key: newKey(c), kind: "makeup_credit_needs_scheduling" })) : []),
    ];
    if (markers.length) {
      await admin.from("notification_log").upsert(
        markers.map((m) => ({ recipient_type: "student", recipient_id: studentId, kind: m.kind, dedup_key: m.key })),
        { onConflict: "kind,dedup_key", ignoreDuplicates: true },
      );
    }
    notified++;
  }

  const groupNotified = await sendGroupCreditReminders(admin, now);

  return NextResponse.json({ checked: credits.length, students: byStudent.size, notified, groupNotified });
}


// Group session credit reminders (studio call 2026-10-02) — same two
// triggers and one-message-per-student rule as the 1:1 credits above,
// with the next 2 sessions each credit can actually book. Skips Bootcamp
// credits (Bootcamps never have credits) and ambassadors.
const groupNewKey = (studentId: string, creditId: string) => `student:${studentId}:group_credit_nudge:${creditId}`;
const groupExpiringKey = (studentId: string, creditId: string) => `student:${studentId}:group_credit_expiring:${creditId}`;

function coachFromTopic(topic: string): string | null {
  const m = topic.split(" | ")[0].match(/\s-\s+Coach\s+(.+)$/i);
  return m ? firstNameOf(m[1].trim()) : null;
}

async function sendGroupCreditReminders(admin: ReturnType<typeof createAdminClient>, now: number): Promise<number> {
  const { data, error } = await admin
    .from("group_lesson_credits")
    .select("id, student_id, topic, expires_at, created_at, students(name, email, phone, archived, ambassador)")
    .eq("used", false)
    .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`);
  if (error) {
    console.error("group credit reminder query failed", error.message);
    return 0;
  }
  type Row = {
    id: string;
    student_id: string;
    topic: string;
    expires_at: string | null;
    created_at: string;
    students: { name: string; email: string; phone: string | null; archived: boolean; ambassador: boolean | null } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.students && !r.students.archived && !r.students.ambassador && !isBootcamp(r.topic));

  const { data: sentRows } = await admin
    .from("notification_log")
    .select("dedup_key")
    .in("kind", ["group_credit_nudge", "group_credit_expiring"]);
  const sent = new Set((sentRows ?? []).map((r) => r.dedup_key as string));

  const byStudent = new Map<string, Row[]>();
  for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);

  let notified = 0;
  for (const [studentId, all] of byStudent) {
    const expiringNow = all.filter(
      (c) =>
        c.expires_at &&
        new Date(c.expires_at).getTime() - now <= EXPIRING_WITHIN_DAYS * DAY_MS &&
        !sent.has(groupExpiringKey(studentId, c.id)),
    );
    // "New": 3–14 days old (the 1:1 nudge waits 3 days too, so a credit
    // used right away never triggers anything).
    const freshNow = all.filter((c) => {
      const age = now - new Date(c.created_at).getTime();
      return age >= 3 * DAY_MS && age <= NEW_MAX_AGE_DAYS * DAY_MS && !sent.has(groupNewKey(studentId, c.id));
    });
    const expiring = expiringNow.length > 0;
    if (!expiring && freshNow.length === 0) continue;

    const student = all[0].students!;
    const credits: GroupCreditLine[] = all.map((c) => ({
      label: cleanGroupTopic(c.topic),
      coachFirstName: coachFromTopic(c.topic),
      expiresAt: c.expires_at,
    }));

    // Next 2 sessions any of their credits can book.
    const options = new Map<string, { at: string; coach: string }>();
    for (const topic of new Set(all.map((c) => c.topic))) {
      for (const l of await getRedeemableGroupLessons(admin, topic, studentId)) options.set(l.id, { at: l.scheduledAt, coach: l.coachName });
    }
    const upcoming = [...options.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, 2)
      .map((o) => {
        const w = lessonTimeFields(o.at, undefined); // studio default: Eastern
        return { when: `${w.lessonDay}, ${w.lessonShortDate} · ${w.lessonTime}`, coachFirstName: firstNameOf(o.coach) };
      });

    const rendered = groupCredits({ firstName: firstNameOf(student.name), credits, upcoming, expiring });
    const triggering = expiring ? expiringNow : freshNow;
    await notifyStudent(admin, {
      studentId,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "makeup_credit_needs_scheduling",
      dedupKey: `student:${studentId}:${expiring ? "group_credit_expiring" : "group_credit_nudge"}:${triggering.map((c) => c.id).sort().join(",")}`,
      title: rendered.bellTitle,
      body: rendered.bellBody,
      linkUrl: "/student/book",
      ghlData: { ...rendered, reminder: expiring ? "expiring" : "new", creditCount: all.length },
      channels: { email: true, sms: false, inApp: true }, // fallback only — Lesson credits switch decides
    });

    const markers = [
      ...triggering.map((c) => ({
        key: expiring ? groupExpiringKey(studentId, c.id) : groupNewKey(studentId, c.id),
        kind: expiring ? "group_credit_expiring" : "group_credit_nudge",
      })),
      ...(expiring ? freshNow.map((c) => ({ key: groupNewKey(studentId, c.id), kind: "group_credit_nudge" })) : []),
    ];
    if (markers.length) {
      await admin.from("notification_log").upsert(
        markers.map((m) => ({ recipient_type: "student", recipient_id: studentId, kind: m.kind, dedup_key: m.key })),
        { onConflict: "kind,dedup_key", ignoreDuplicates: true },
      );
    }
    notified++;
  }
  return notified;
}
