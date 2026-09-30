import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStudent } from "@/lib/notifications/create";
import { creditsAdded, taraLessonPurchased, type GroupCreditsAdded } from "@/lib/email/templates/credits-added";
import type { LessonCreditLine } from "@/lib/email/templates/lesson-credits";
import { groupCreditKey } from "@/lib/group-lesson-topic";
import { firstNameOf } from "@/lib/ghl/fields";

// What a one-time add-on purchase adds to the student's account
// (studio call 2026-09-26) — credits land instantly, then a "ready to
// book" notification. Anything not listed (Spotlight) stays manual.
// "single_lesson_tara_pro" adds nothing: credits don't carry a coach, so
// the studio schedules it — the student just gets a thank-you.
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const LESSON_PACKS: Record<string, { count: number; minutes: number }> = {
  four_pack_30min: { count: 4, minutes: 30 },
  single_lesson_pro: { count: 1, minutes: 30 },
  single_lesson_60min_pro: { count: 1, minutes: 60 },
};
const GROUP_PACKS: Record<string, number> = { four_pack_group_class: 4 };
export const GROUP_SESSION_TOPIC = "Group Coaching Session";

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface StudentContact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notify_alerts_email: boolean;
  notify_alerts_sms: boolean;
  notify_alerts_inapp: boolean;
}

async function loadStudent(admin: SupabaseClient, studentId: string): Promise<StudentContact | null> {
  const { data } = await admin
    .from("students")
    .select("id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp")
    .eq("id", studentId)
    .maybeSingle();
  return (data as StudentContact | null) ?? null;
}

// The group-session "family" a student already belongs to — their most
// recent Group Coaching Session registration's class + coach (e.g.
// "Group Coaching Session - Coach Nikki"), so pack credits stay with their
// usual coach. None yet → plain "Group Coaching Session", which works with
// ANY coach (lib/group-lesson-topic.ts), so they pick.
export async function usualGroupTopic(admin: SupabaseClient, studentId: string): Promise<string> {
  const { data } = await admin
    .from("group_lesson_registrations")
    .select("group_lessons(topic, scheduled_at)")
    .eq("student_id", studentId);
  const lessons = ((data ?? []) as { group_lessons: One<{ topic: string | null; scheduled_at: string }> }[])
    .map((r) => one(r.group_lessons))
    .filter((l): l is { topic: string; scheduled_at: string } => !!l?.topic)
    .filter((l) => groupCreditKey(l.topic).startsWith("group coaching session - coach "))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return lessons[0] ? lessons[0].topic.split(" | ")[0].trim().replace(/^semi-?private vocal group class/i, GROUP_SESSION_TOPIC) : GROUP_SESSION_TOPIC;
}

export function coachFirstNameFromTopic(topic: string): string | null {
  const m = topic.match(/-\s*Coach\s+(\S+)/i);
  return m ? m[1] : null;
}

export async function notifyStudentCreditsAdded(
  admin: SupabaseClient,
  studentId: string,
  opts: { purchased: boolean; lessons: LessonCreditLine[]; group: GroupCreditsAdded | null; reference: string },
): Promise<void> {
  try {
    const s = await loadStudent(admin, studentId);
    if (!s || (!opts.lessons.length && !opts.group)) return;
    const r = creditsAdded({ firstName: firstNameOf(s.name), purchased: opts.purchased, lessons: opts.lessons, group: opts.group });
    await notifyStudent(admin, {
      studentId,
      email: s.email,
      phone: s.phone,
      group: "alerts",
      kind: "makeup_credit_needs_scheduling",
      dedupKey: `student:${studentId}:credits_added:${opts.reference}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/book",
      ghlData: { ...r, reference: opts.reference },
      // Purchase/credit emails always go out — students can't switch
      // these off; only the text follows their Alerts → Text setting
      // (studio call 2026-09-26).
      channels: { email: true, sms: s.notify_alerts_sms, inApp: s.notify_alerts_inapp },
      emailAlways: true, // purchase
    });
  } catch (err) {
    console.error(`notifyStudentCreditsAdded failed for ${studentId}`, err);
  }
}

// Called right after a successful add-on charge. Returns a short note for
// the staff Slack ping ("4 credits added automatically").
export async function fulfillAddonPurchase(
  admin: SupabaseClient,
  opts: { studentId: string; addonId: string; paymentReference: string },
): Promise<string | null> {
  const expiresAt = new Date(Date.now() + YEAR_MS).toISOString();

  const lesson = LESSON_PACKS[opts.addonId];
  if (lesson) {
    const rows = Array.from({ length: lesson.count }, () => ({
      student_id: opts.studentId,
      type: "purchased-addon" as const,
      expires_at: expiresAt,
      duration_minutes: lesson.minutes,
      reason: `Bought in portal (${opts.paymentReference})`,
    }));
    const { error } = await admin.from("makeup_credits").insert(rows);
    if (error) {
      console.error(`fulfillAddonPurchase: credit insert failed for ${opts.studentId}`, error);
      return "⚠️ credits NOT added automatically — please add them by hand";
    }
    await notifyStudentCreditsAdded(admin, opts.studentId, {
      purchased: true,
      lessons: rows.map((r) => ({ durationMinutes: r.duration_minutes, expiresAt })),
      group: null,
      reference: opts.paymentReference,
    });
    return `${lesson.count} × ${lesson.minutes}-min credit${lesson.count === 1 ? "" : "s"} added automatically`;
  }

  const groupCount = GROUP_PACKS[opts.addonId];
  if (groupCount) {
    const topic = await usualGroupTopic(admin, opts.studentId);
    const rows = Array.from({ length: groupCount }, () => ({
      student_id: opts.studentId,
      topic,
      expires_at: expiresAt,
      reason: `Bought in portal (${opts.paymentReference})`,
    }));
    const { error } = await admin.from("group_lesson_credits").insert(rows);
    if (error) {
      console.error(`fulfillAddonPurchase: group credit insert failed for ${opts.studentId}`, error);
      return "⚠️ group credits NOT added automatically — please add them by hand";
    }
    await notifyStudentCreditsAdded(admin, opts.studentId, {
      purchased: true,
      lessons: [],
      group: { count: groupCount, label: GROUP_SESSION_TOPIC, coachFirstName: coachFirstNameFromTopic(topic), expiresAt },
      reference: opts.paymentReference,
    });
    return `${groupCount} group credits added automatically (${topic})`;
  }

  if (opts.addonId === "single_lesson_tara_pro") {
    const s = await loadStudent(admin, opts.studentId);
    if (s) {
      const r = taraLessonPurchased({ firstName: firstNameOf(s.name) });
      await notifyStudent(admin, {
        studentId: s.id,
        email: s.email,
        phone: s.phone,
        group: "alerts",
        kind: "makeup_credit_needs_scheduling",
        dedupKey: `student:${s.id}:tara_lesson_purchase:${opts.paymentReference}`,
        title: r.bellTitle,
        body: r.bellBody,
        linkUrl: "/student/dashboard",
        ghlData: { ...r, reference: opts.paymentReference },
        channels: { email: true, sms: s.notify_alerts_sms, inApp: s.notify_alerts_inapp }, // purchase: email always
        emailAlways: true, // purchase
      }).catch((err) => console.error("tara lesson purchase notice failed", err));
    }
    return "schedule this lesson with Tara by hand (student was told we'll reach out)";
  }

  return null;
}
