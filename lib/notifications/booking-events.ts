import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStudent } from "@/lib/notifications/create";
import { bookingConfirmed, lessonCancelled, type BookedLesson } from "@/lib/email/templates/booking";
import { firstNameOf, lessonTimeFields } from "@/lib/ghl/fields";
import { cleanGroupTopic } from "@/lib/admin/recording-matching";

// Student-facing booking confirmation / cancellation. Called after the
// booking or cancel has already succeeded; every function here swallows
// its own errors — a notification hiccup must never fail a real booking.
//
// Admin screens pass notify=false via a "Notify student" checkbox (default
// on) so fixing a mistake doesn't spam the student; self-service actions
// always notify.

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface StudentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notify_alerts_email: boolean;
  notify_alerts_sms: boolean;
  notify_alerts_inapp: boolean;
}
const STUDENT_COLS = "id, name, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp";

function lessonOf(scheduledAt: string, tz: string | null | undefined): BookedLesson {
  const w = lessonTimeFields(scheduledAt, tz);
  return { lessonDate: w.lessonDate, lessonShortDate: w.lessonShortDate, lessonDay: w.lessonDay, lessonTime: w.lessonTime };
}

const channelsOf = (s: StudentRow) => ({
  email: s.notify_alerts_email,
  sms: s.notify_alerts_sms,
  inApp: s.notify_alerts_inapp,
});

async function loadSession(sessionId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sessions")
    .select(`id, scheduled_at, duration_minutes, is_trial, students(${STUDENT_COLS}), coaches:actual_coach_id(name, timezone)`)
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const student = one(data.students as unknown as One<StudentRow>);
  const coach = one(data.coaches as unknown as One<{ name: string; timezone: string }>);
  if (!student) return null;
  return { admin, session: data, student, coach };
}

// `purchase`: the booking IS a purchase (bonus-week lesson) — email
// always goes out regardless of their settings, like every purchase.
export async function notifyStudentSessionBooked(sessionId: string, opts: { purchase?: boolean } = {}): Promise<void> {
  try {
    const ctx = await loadSession(sessionId);
    if (!ctx) return;
    const { admin, session, student, coach } = ctx;
    const r = bookingConfirmed({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      label: session.is_trial ? "Trial Lesson" : "Private Coaching Session",
      isGroup: false,
      durationMinutes: session.duration_minutes,
      lessons: [lessonOf(session.scheduled_at, coach?.timezone)],
    });
    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "session_booked",
      dedupKey: `student:${student.id}:session_booked:${sessionId}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { sessionId, ...r },
      channels: channelsOf(student),
      emailAlways: !!opts.purchase,
    });
  } catch (err) {
    console.error(`notifyStudentSessionBooked failed for ${sessionId}`, err);
  }
}

export async function notifyStudentSessionCancelled(
  sessionId: string,
  outcome: "credit" | "no_credit" | "studio",
  creditExpiresAt: string | null,
): Promise<void> {
  try {
    const ctx = await loadSession(sessionId);
    if (!ctx) return;
    const { admin, session, student, coach } = ctx;
    const r = lessonCancelled({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      label: session.is_trial ? "Trial Lesson" : "Private Coaching Session",
      lesson: lessonOf(session.scheduled_at, coach?.timezone),
      outcome,
      credit: outcome === "no_credit" ? null : { durationMinutes: session.duration_minutes, expiresAt: creditExpiresAt },
    });
    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "session_cancelled",
      dedupKey: `student:${student.id}:session_cancelled:${sessionId}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/book",
      ghlData: { sessionId, outcome, ...r },
      channels: channelsOf(student),
    });
  } catch (err) {
    console.error(`notifyStudentSessionCancelled failed for ${sessionId}`, err);
  }
}

// One confirmation for one or many group sessions (a series sign-up gets a
// single email listing every date, not one per class).
export async function notifyStudentGroupBooked(studentId: string, groupLessonIds: string[]): Promise<void> {
  try {
    if (!groupLessonIds.length) return;
    const admin = createAdminClient();
    const [{ data: student }, { data: lessons }] = await Promise.all([
      admin.from("students").select(STUDENT_COLS).eq("id", studentId).maybeSingle(),
      admin
        .from("group_lessons")
        .select("id, topic, scheduled_at, duration_minutes, coaches(name, timezone)")
        .in("id", groupLessonIds)
        .order("scheduled_at"),
    ]);
    if (!student || !lessons?.length) return;
    const coach = one(lessons[0].coaches as unknown as One<{ name: string; timezone: string }>);
    const r = bookingConfirmed({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      label: cleanGroupTopic(lessons[0].topic),
      isGroup: true,
      durationMinutes: lessons[0].duration_minutes,
      lessons: lessons.map((l) => lessonOf(l.scheduled_at, coach?.timezone)),
    });
    await notifyStudent(admin, {
      studentId,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "group_session_booked",
      dedupKey: `student:${studentId}:group_session_booked:${[...groupLessonIds].sort().join(",")}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { groupLessonIds, ...r },
      channels: channelsOf(student as StudentRow),
    });
  } catch (err) {
    console.error(`notifyStudentGroupBooked failed for ${studentId}`, err);
  }
}

// A student set up their own weekly lesson (app/api/student/weekly-lesson).
// Same booked-lessons confirmation as a series sign-up, listing the first
// few weeks so they can see the pattern and the first date.
export async function notifyStudentWeeklyLessonSet(scheduleId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: schedule } = await admin
      .from("recurring_schedules")
      .select(`id, duration_minutes, students(${STUDENT_COLS}), coaches(name, timezone)`)
      .eq("id", scheduleId)
      .maybeSingle();
    if (!schedule) return false;
    const student = one(schedule.students as unknown as One<StudentRow>);
    const coach = one(schedule.coaches as unknown as One<{ name: string; timezone: string }>);
    if (!student) return false;

    const { data: sessions } = await admin
      .from("sessions")
      .select("scheduled_at")
      .eq("recurring_schedule_id", scheduleId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true })
      .limit(4);
    if (!sessions || sessions.length === 0) return false;

    const r = bookingConfirmed({
      firstName: firstNameOf(student.name),
      coachFirstName: firstNameOf(coach?.name),
      label: "Weekly Lesson",
      isGroup: false,
      durationMinutes: schedule.duration_minutes,
      lessons: sessions.map((s) => lessonOf(s.scheduled_at, coach?.timezone)),
    });
    await notifyStudent(admin, {
      studentId: student.id,
      email: student.email,
      phone: student.phone,
      group: "alerts",
      kind: "session_booked",
      dedupKey: `student:${student.id}:weekly_lesson_set:${scheduleId}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { scheduleId, ...r },
      channels: channelsOf(student),
      // Setting up their lessons is part of joining — always confirm by
      // email, whatever their alert settings.
      emailAlways: true,
    });
    return true;
  } catch (err) {
    console.error(`notifyStudentWeeklyLessonSet failed for schedule ${scheduleId}`, err);
    return false;
  }
}
