import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUnscheduledMakeupCredits, type UnscheduledCredit } from "@/lib/makeup-credits/unscheduled";
import { notifyStudent } from "@/lib/notifications/create";
import { STUDENT_NOTIFICATIONS_PAUSED } from "@/lib/notifications/pause";
import { lessonCredits } from "@/lib/email/templates/lesson-credits";
import { firstNameOf } from "@/lib/ghl/fields";

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
// Email + bell only, no SMS.
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
    .select("id, notify_alerts_email, notify_alerts_inapp")
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
      channels: { email: prefs.notify_alerts_email, sms: false, inApp: prefs.notify_alerts_inapp },
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

  return NextResponse.json({ checked: credits.length, students: byStudent.size, notified });
}
