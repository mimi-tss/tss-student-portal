import type { createClient } from "@/lib/supabase/server";
import { zonedYearMonthDay, zonedTimeToUtc } from "@/lib/timezone";
import { currentBillingCycleRange, effectiveSessionCycleCap } from "@/lib/scheduling/recurring";
import { getCoachGroupLessons, type CoachGroupLesson } from "@/lib/group-lessons";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Shared "today" boundary logic, bounded by the COACH's own timezone —
// used by both getTodaysSchedule and getTodaysGroupLessons so the two
// lists never disagree about where today starts/ends.
function getTodayBounds(timeZone: string): { dayStart: Date; dayEnd: Date } {
  const [y, m, d] = zonedYearMonthDay(new Date(), timeZone);
  const dayStart = zonedTimeToUtc(y, m, d, 0, 0, timeZone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export async function getTodaysGroupLessons(
  supabase: SupabaseClient,
  coachId: string,
  timeZone: string,
): Promise<CoachGroupLesson[]> {
  const { dayStart, dayEnd } = getTodayBounds(timeZone);
  return getCoachGroupLessons(supabase, coachId, dayStart.toISOString(), dayEnd.toISOString());
}

export interface TodaySession {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  isTrial: boolean;
  studentId: string;
  studentName: string;
  tier: string;
  needsAttendance: boolean;
}

// Today's schedule, bounded by the COACH's own timezone (spec section 8:
// a coach's calendar always displays in their own zone) — not the
// server's or the viewer's selected display zone, since "today" for
// attendance-marking purposes should match the coach's actual working
// day.
export async function getTodaysSchedule(
  supabase: SupabaseClient,
  coachId: string,
  timeZone: string,
): Promise<TodaySession[]> {
  const { dayStart, dayEnd } = getTodayBounds(timeZone);
  const now = new Date();

  // A with-notice cancellation vacates the slot entirely (the makeup is
  // its own separate row) — excluded here same as the calendar grid. A
  // no-notice cancellation stays visible (still shown, still "held" —
  // see statusDotClass/STATUS_LABEL in dashboard-client.tsx).
  const { data } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, status, is_trial, student_id, students(name, tier)")
    .eq("actual_coach_id", coachId)
    .gte("scheduled_at", dayStart.toISOString())
    .lt("scheduled_at", dayEnd.toISOString())
    .not("status", "eq", "cancelled-with-notice")
    .order("scheduled_at");

  return (data ?? []).map((s) => {
    const student = unwrapJoin(s.students as unknown as { name: string; tier: string } | { name: string; tier: string }[] | null);
    const sessionEnd = new Date(new Date(s.scheduled_at).getTime() + s.duration_minutes * 60 * 1000);
    return {
      id: s.id,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes,
      status: s.status,
      isTrial: s.is_trial,
      studentId: s.student_id,
      studentName: student?.name ?? "Student",
      tier: student?.tier ?? "",
      needsAttendance: s.status === "scheduled" && sessionEnd <= now,
    };
  });
}

export interface CoachStudent {
  id: string;
  name: string;
  tier: string;
}

// Every student this coach can see — currently assigned, plus anyone
// they've ever had a real session with (same scoping as /api/coach/students
// and the auth_coach_student_ids() RLS helper), reused here for both "My
// Students" and the reminder queries below.
export async function getCoachStudents(
  supabase: SupabaseClient,
  coachId: string,
): Promise<CoachStudent[]> {
  const [{ data: assigned }, { data: sessionRows }] = await Promise.all([
    supabase.from("students").select("id, name, tier").eq("assigned_coach_id", coachId),
    supabase.from("sessions").select("student_id").eq("actual_coach_id", coachId),
  ]);

  const assignedIds = new Set((assigned ?? []).map((s) => s.id));
  const historicalIds = [...new Set((sessionRows ?? []).map((r) => r.student_id))].filter(
    (id) => !assignedIds.has(id),
  );

  let historical: CoachStudent[] = [];
  if (historicalIds.length > 0) {
    const { data } = await supabase.from("students").select("id, name, tier").in("id", historicalIds);
    historical = data ?? [];
  }

  return [...(assigned ?? []), ...historical].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ExpiringMakeup {
  studentId: string;
  studentName: string;
  daysLeft: number;
  expiresAt: string;
}

// Only the 30-day-expiry type (student-fault) — spec section 8 is
// explicit that no-expiry emergency credits "shouldn't clutter this."
export async function getMakeupsExpiringSoon(
  supabase: SupabaseClient,
  studentIds: string[],
  withinDays = 14,
): Promise<ExpiringMakeup[]> {
  if (studentIds.length === 0) return [];

  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from("makeup_credits")
    .select("student_id, expires_at, students(name)")
    .in("student_id", studentIds)
    .eq("type", "student-fault")
    .eq("used", false)
    .not("expires_at", "is", null)
    .lte("expires_at", cutoff.toISOString())
    .gte("expires_at", now.toISOString())
    .order("expires_at", { ascending: true });

  return (data ?? []).map((c) => {
    const student = unwrapJoin(c.students as unknown as { name: string } | { name: string }[] | null);
    const daysLeft = Math.max(0, Math.ceil((new Date(c.expires_at!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    return {
      studentId: c.student_id,
      studentName: student?.name ?? "Student",
      daysLeft,
      expiresAt: c.expires_at!,
    };
  });
}

export interface UpcomingBirthday {
  studentId: string;
  studentName: string;
  month: number;
  day: number;
}

// Month/day only — the stored year is never surfaced to a coach.
export async function getBirthdaysThisWeek(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<UpcomingBirthday[]> {
  if (studentIds.length === 0) return [];

  const { data } = await supabase
    .from("students")
    .select("id, name, birth_date")
    .in("id", studentIds)
    .not("birth_date", "is", null);

  const today = new Date();
  const results: UpcomingBirthday[] = [];

  for (const s of data ?? []) {
    const bd = new Date(`${s.birth_date}T00:00:00Z`);
    for (let offset = 0; offset < 7; offset++) {
      const check = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
      if (bd.getUTCMonth() === check.getUTCMonth() && bd.getUTCDate() === check.getUTCDate()) {
        results.push({ studentId: s.id, studentName: s.name, month: bd.getUTCMonth() + 1, day: bd.getUTCDate() });
        break;
      }
    }
  }

  return results;
}

export interface StudentSnapshot {
  id: string;
  name: string;
  tier: string;
  subscriptionStatus: string;
  sessionsThisCycle: number;
  sessionCycleCap: number | null;
  makeupCreditsAvailable: number;
  nextSession: { scheduledAt: string; durationMinutes: number } | null;
  withYouSince: string | null;
  // A pending/approved cancellation (admin-flagged, student-submitted,
  // or auto-detected via the Kajabi sync cron) — surfaced to the coach
  // too, not just admin, so they have a chance to try to save the
  // student before the studio loses them (spec: "coaches should know").
  cancellationFlag: { reason: string | null; effectiveDate: string } | null;
}

// The right-side "student detail panel" — deliberately never selects
// email or phone (spec: "student email addresses and phone numbers are
// never shown to coaches — that stays with Studio Admin").
export async function getStudentSnapshot(
  supabase: SupabaseClient,
  coachId: string,
  studentId: string,
): Promise<StudentSnapshot | null> {
  const { data: student } = await supabase
    .from("students")
    .select("id, name, tier, subscription_status, billing_anniversary_date, coach_start_date_override")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) return null;

  const { start: cycleStart, end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);

  const [{ count: sessionsThisCycle }, { data: credits }, { data: nextSession }, { data: firstSession }, { data: cancelRequest }, { data: recurringSchedule }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentId)
        .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,paused,holiday)")
        .gte("scheduled_at", cycleStart.toISOString())
        .lt("scheduled_at", cycleEnd.toISOString()),
      supabase
        .from("makeup_credits")
        .select("id")
        .eq("student_id", studentId)
        .eq("used", false)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      supabase
        .from("sessions")
        .select("scheduled_at, duration_minutes")
        .eq("student_id", studentId)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at")
        .limit(1)
        .maybeSingle(),
      // "With you since" — this coach's own relationship start, not the
      // student's overall studio start date. Earliest session where this
      // coach was the one who actually taught it — overridden below by
      // student.coach_start_date_override when admin has set one (real
      // history predating this app, for a migrated student).
      supabase
        .from("sessions")
        .select("scheduled_at")
        .eq("student_id", studentId)
        .eq("actual_coach_id", coachId)
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("student_requests")
        .select("reason, effective_date")
        .eq("student_id", studentId)
        .eq("type", "cancel_subscription")
        .in("status", ["pending", "approved"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("recurring_schedules")
        .select("cadence")
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);

  return {
    id: student.id,
    name: student.name,
    tier: student.tier,
    subscriptionStatus: student.subscription_status,
    sessionsThisCycle: sessionsThisCycle ?? 0,
    sessionCycleCap: effectiveSessionCycleCap(student.tier, recurringSchedule?.cadence),
    makeupCreditsAvailable: credits?.length ?? 0,
    nextSession: nextSession ? { scheduledAt: nextSession.scheduled_at, durationMinutes: nextSession.duration_minutes } : null,
    withYouSince: student.coach_start_date_override ?? firstSession?.scheduled_at ?? null,
    cancellationFlag: cancelRequest
      ? { reason: cancelRequest.reason, effectiveDate: cancelRequest.effective_date }
      : null,
  };
}
