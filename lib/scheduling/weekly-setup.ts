import { getHeldRecurringSlots, occurrencesFor, slotFitsWorkingHours } from "@/lib/scheduling/recurring";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";
import { windowEndMinutes, type WorkingHours } from "@/lib/scheduling/working-hours";
import { zonedYearMonthDay } from "@/lib/timezone";

// Student self-setup of their weekly 1:1 lesson (Pro/Elite with no
// weekly slot yet — app/(student)/student/weekly-lesson). Decides which
// recurring day/times a student may pick with a given coach. Stricter
// than the admin form on purpose: an admin can see and work around a
// clash, a brand-new student can't, so a slot is only offered when the
// first SETUP_CHECK_OCCURRENCES lessons (one billing cycle) are all free.
// Later one-off clashes (a vacation block months out) are skipped per
// week by materializeRecurringSessions, same as for admin-set slots.

// The coach gets at least this much notice before the first lesson.
export const SETUP_LEAD_HOURS = 48;
export const SETUP_CHECK_OCCURRENCES = 4;
const WALK_MINUTES = 30;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface WeeklyOption {
  dayOfWeek: number; // in the COACH's zone, 0 = Sunday
  startTime: string; // "HH:MM", wall-clock in the COACH's zone
  firstAt: string; // ISO instant of the first lesson
}

type Range = readonly [Date, Date];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function rangeOf(startIso: string, minutes: number): Range {
  const start = new Date(startIso);
  return [start, new Date(start.getTime() + minutes * 60_000)] as const;
}

interface SetupContext {
  timeZone: string;
  workingHours: WorkingHours;
  pendingWorkingHours: WorkingHours | null;
  coachSchedules: { day_of_week: number; start_time: string; duration_minutes: number }[];
  busy: Range[];
  billingAnniversaryDate: string | null;
  holidayDates: Set<string>;
  leadStart: Date;
  durationMinutes: number;
}

// Needs the service-role client: other students' sessions/schedules and
// group lessons are RLS-hidden from a student (see
// app/api/booking/slots for the live double-booking that caused).
async function loadContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { coachId: string; studentId: string; durationMinutes: number; now?: Date },
): Promise<SetupContext | null> {
  const now = opts.now ?? new Date();
  const leadStart = new Date(now.getTime() + SETUP_LEAD_HOURS * 3_600_000);
  // A cycle's worth of occurrences can stretch past 4 weeks when the
  // billing cap or a holiday drops one, so look a little further.
  const horizonEnd = new Date(leadStart.getTime() + (SETUP_CHECK_OCCURRENCES + 3) * 7 * 86_400_000);

  const { data: coach } = await admin
    .from("coaches")
    .select("working_hours, pending_working_hours, timezone")
    .eq("id", opts.coachId)
    .maybeSingle();
  if (!coach) return null;

  const [
    { data: student },
    { data: coachSchedules },
    { data: coachSessions },
    { data: blocks },
    { data: groupLessons },
    { data: ownSessions },
    { data: ownGroupRegs },
    heldSlots,
    holidayDates,
  ] = await Promise.all([
    admin.from("students").select("billing_anniversary_date").eq("id", opts.studentId).maybeSingle(),
    admin
      .from("recurring_schedules")
      .select("day_of_week, start_time, duration_minutes")
      .eq("coach_id", opts.coachId)
      .eq("active", true),
    // Only a with-notice cancellation (or a holiday) frees the time —
    // same rule as app/api/booking/slots and materializeRecurringSessions.
    admin
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("actual_coach_id", opts.coachId)
      .gte("scheduled_at", new Date(leadStart.getTime() - 4 * 3_600_000).toISOString())
      .lte("scheduled_at", horizonEnd.toISOString())
      .not("status", "in", "(cancelled-with-notice,holiday)"),
    admin
      .from("coach_blocks")
      .select("start_at, end_at")
      .eq("coach_id", opts.coachId)
      .lte("start_at", horizonEnd.toISOString())
      .gte("end_at", leadStart.toISOString()),
    admin
      .from("group_lessons")
      .select("scheduled_at, duration_minutes")
      .eq("coach_id", opts.coachId)
      .is("cancelled_at", null)
      .gte("scheduled_at", new Date(leadStart.getTime() - 4 * 3_600_000).toISOString())
      .lte("scheduled_at", horizonEnd.toISOString()),
    // The student's own lessons with any coach (e.g. a booked trial).
    admin
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("student_id", opts.studentId)
      .gte("scheduled_at", new Date(leadStart.getTime() - 4 * 3_600_000).toISOString())
      .lte("scheduled_at", horizonEnd.toISOString())
      .not("status", "in", "(cancelled-with-notice,holiday)"),
    admin
      .from("group_lesson_registrations")
      .select("group_lessons!inner(scheduled_at, duration_minutes, cancelled_at)")
      .eq("student_id", opts.studentId)
      .is("group_lessons.cancelled_at", null)
      .gte("group_lessons.scheduled_at", leadStart.toISOString())
      .lte("group_lessons.scheduled_at", horizonEnd.toISOString()),
    // A paused student's slot stays reserved with no session rows.
    getHeldRecurringSlots(admin, opts.coachId, leadStart, horizonEnd),
    getHolidayDateKeys(admin),
  ]);

  const ownGroupLessons = (ownGroupRegs ?? []).flatMap((r: { group_lessons: unknown }) => {
    const g = r.group_lessons as
      | { scheduled_at: string; duration_minutes: number }
      | { scheduled_at: string; duration_minutes: number }[]
      | null;
    return Array.isArray(g) ? g : g ? [g] : [];
  });

  const busy: Range[] = [
    ...[...(coachSessions ?? []), ...(ownSessions ?? []), ...(groupLessons ?? []), ...ownGroupLessons].map(
      (s: { scheduled_at: string; duration_minutes: number }) => rangeOf(s.scheduled_at, s.duration_minutes),
    ),
    ...(blocks ?? []).map((b: { start_at: string; end_at: string }) => [new Date(b.start_at), new Date(b.end_at)] as const),
    ...heldSlots.map((h) => rangeOf(h.scheduledAt, h.durationMinutes)),
  ];

  return {
    timeZone: coach.timezone ?? "America/New_York",
    workingHours: (coach.working_hours ?? {}) as WorkingHours,
    pendingWorkingHours: (coach.pending_working_hours ?? null) as WorkingHours | null,
    coachSchedules: coachSchedules ?? [],
    busy,
    billingAnniversaryDate: student?.billing_anniversary_date ?? null,
    holidayDates,
    leadStart,
    durationMinutes: opts.durationMinutes,
  };
}

function evaluate(ctx: SetupContext, dayOfWeek: number, startTime: string): WeeklyOption | null {
  const { durationMinutes } = ctx;
  if (!slotFitsWorkingHours(ctx.workingHours, dayOfWeek, startTime, durationMinutes)) return null;
  // A queued hours change (migration 0044) applies to every lesson from
  // its effective date on — a weekly slot runs past it, so it must fit
  // both the current and the upcoming hours.
  if (ctx.pendingWorkingHours && !slotFitsWorkingHours(ctx.pendingWorkingHours, dayOfWeek, startTime, durationMinutes)) {
    return null;
  }

  const [hh, mm] = startTime.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin = startMin + durationMinutes;
  const clashesRecurring = ctx.coachSchedules.some((s) => {
    if (s.day_of_week !== dayOfWeek) return false;
    const [oh, om] = s.start_time.split(":").map(Number);
    const otherStart = oh * 60 + om;
    return startMin < otherStart + s.duration_minutes && endMin > otherStart;
  });
  if (clashesRecurring) return null;

  const occurrences = occurrencesFor(
    dayOfWeek,
    startTime,
    ctx.timeZone,
    ctx.leadStart,
    SETUP_CHECK_OCCURRENCES + 3,
    ctx.billingAnniversaryDate,
    ctx.holidayDates,
  ).slice(0, SETUP_CHECK_OCCURRENCES);
  if (occurrences.length === 0) return null;

  const clashesOneOff = occurrences.some((start) => {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    return ctx.busy.some(([bStart, bEnd]) => start < bEnd && end > bStart);
  });
  if (clashesOneOff) return null;

  return { dayOfWeek, startTime, firstAt: occurrences[0].toISOString() };
}

// Every weekly time a student could pick with this coach, earliest first
// lesson first. Walks each weekday's working-hours windows in 30-minute
// steps, same grid as one-off booking (app/api/booking/slots).
export async function listWeeklyOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { coachId: string; studentId: string; durationMinutes: number; now?: Date },
): Promise<WeeklyOption[]> {
  const ctx = await loadContext(admin, opts);
  if (!ctx) return [];

  const options: WeeklyOption[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const seen = new Set<string>();
    for (const [winStart, winEnd] of ctx.workingHours[DAY_KEYS[dayOfWeek]] ?? []) {
      const [wh, wm] = winStart.split(":").map(Number);
      const endMin = windowEndMinutes(winEnd);
      for (let m = wh * 60 + wm; m + opts.durationMinutes <= endMin; m += WALK_MINUTES) {
        const startTime = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
        if (seen.has(startTime)) continue;
        seen.add(startTime);
        const option = evaluate(ctx, dayOfWeek, startTime);
        if (option) options.push(option);
      }
    }
  }

  return options.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

// Re-checks one chosen slot at save time — the list the student picked
// from may be minutes old.
export async function checkWeeklyOption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { coachId: string; studentId: string; durationMinutes: number; dayOfWeek: number; startTime: string },
): Promise<WeeklyOption | null> {
  if (!/^\d{2}:\d{2}$/.test(opts.startTime) || opts.dayOfWeek < 0 || opts.dayOfWeek > 6) return null;
  const ctx = await loadContext(admin, opts);
  if (!ctx) return null;
  return evaluate(ctx, opts.dayOfWeek, opts.startTime);
}

// schedule.start_date for a self-set slot: the first lesson's calendar
// date in the coach's zone, so materialization starts exactly there and
// the 48h notice holds.
export function startDateFor(firstAt: string, coachTimeZone: string): string {
  const [y, m, d] = zonedYearMonthDay(new Date(firstAt), coachTimeZone);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export interface SetupCoach {
  id: string;
  name: string;
}

export type WeeklySetupState =
  | { kind: "not_eligible"; reason: string }
  | { kind: "has_schedule" }
  | {
      kind: "ready";
      studentId: string;
      durationMinutes: number;
      coaches: SetupCoach[];
      // Set when an admin already assigned a coach — the student can
      // only pick times with that coach.
      lockedCoachId: string | null;
      // Shown first: the assigned coach, else the coach from their trial
      // lesson (Suite→Pro upgrades), when that coach is pickable.
      preselectedCoachId: string | null;
    };

// Who may use self-setup, decided in one place for the page and the API
// (studio decision 2026-10-07): Pro/Elite only (Suite gets a one-time
// trial, Lite has no portal), in good standing, and with no active
// weekly slot yet — after that, changes go through the studio.
export async function loadWeeklySetupState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  student: {
    id: string;
    tier: string;
    assigned_coach_id: string | null;
    session_duration_minutes: number | null;
    subscription_status: string;
    payment_status: string;
  },
): Promise<WeeklySetupState> {
  if (student.tier !== "pro" && student.tier !== "elite") {
    return { kind: "not_eligible", reason: "Weekly lessons are part of Pro and Elite." };
  }
  if (student.subscription_status === "paused") {
    return { kind: "not_eligible", reason: "Your membership is paused. Message the studio when you're ready to start again." };
  }
  if (student.subscription_status === "cancelled") {
    return { kind: "not_eligible", reason: "Your membership has been cancelled. Message the studio if you'd like to come back." };
  }
  if (student.payment_status === "dnc") {
    return {
      kind: "not_eligible",
      reason: "There's a payment issue on your account. Please update your payment method, then come back here.",
    };
  }

  const { count, error: countError } = await admin
    .from("recurring_schedules")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .eq("active", true);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return { kind: "has_schedule" };

  let coaches: SetupCoach[];
  if (student.assigned_coach_id) {
    // An assigned coach who has since left (active=false) isn't offered —
    // the page then asks the student to message the studio.
    const { data } = await admin
      .from("coaches")
      .select("id, name")
      .eq("id", student.assigned_coach_id)
      .eq("active", true)
      .maybeSingle();
    coaches = data ? [data] : [];
  } else {
    const { data, error } = await admin
      .from("coaches")
      .select("id, name")
      .eq("active", true)
      .eq("hidden_from_students", false)
      .order("name");
    if (error) throw new Error(error.message);
    coaches = data ?? [];
  }

  let preselectedCoachId: string | null = student.assigned_coach_id;
  if (!preselectedCoachId) {
    const { data: trial } = await admin
      .from("sessions")
      .select("actual_coach_id")
      .eq("student_id", student.id)
      .eq("is_trial", true)
      .not("status", "eq", "cancelled-with-notice")
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (trial && coaches.some((c) => c.id === trial.actual_coach_id)) preselectedCoachId = trial.actual_coach_id;
  }

  return {
    kind: "ready",
    studentId: student.id,
    durationMinutes: student.session_duration_minutes ?? 30,
    coaches,
    lockedCoachId: student.assigned_coach_id,
    preselectedCoachId,
  };
}
