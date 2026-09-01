import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/timezone";
import { getHolidayDateKeys, isHolidayInstant } from "@/lib/scheduling/holidays";
import { windowEndMinutes } from "@/lib/scheduling/working-hours";

// How far ahead recurring occurrences are materialized. Topped up daily
// by /api/cron/materialize-recurring, so a recurring schedule already
// continues indefinitely in practice — every day the cron runs, the
// horizon slides one day further out, forever, until the schedule
// itself is changed/removed or the student's subscription is cancelled
// (materializeRecurringSessions already stops populating past a
// cancellation's effective date, and cuts off at a pause window). A
// literal unbounded lookahead isn't meaningful for a *materialized* real
// `sessions` row per occurrence — there's no "last" week to stop at, so
// this is just how much runway sits ready at any one time, not a cap on
// how long the recurring booking lasts. Bumped from 8 (~2 months, felt
// like an artificial wall in the Month view) to a full year — plenty of
// visible runway without generating an unreasonable number of rows for
// students who end up changing their schedule long before using them.
export const WEEKS_AHEAD = 52;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type WorkingHours = Record<string, [string, string][]>;

// `start_time` is wall-clock in the COACH's own zone, not necessarily
// the zone it's being displayed in (an admin viewing in Eastern for a
// Pacific coach, or a student viewing in their own local zone) — so
// showing it as a bare string would silently show the wrong time to
// anyone not in the coach's zone. This picks the nearest real instant
// (today or later) that actually falls on `dayOfWeek` at `startTime` in
// `coachTimeZone`, so callers can reformat it into any viewer's zone via
// formatTimeInZone/formatDateTimeInZone (lib/timezone.ts) and get both
// the correct clock time AND, in the rare case the zone gap crosses
// midnight, the correct day. Purely a display helper — not used for
// generating real occurrences (see occurrencesFor for that).
export function nextWeeklySlotInstant(
  dayOfWeek: number,
  startTime: string,
  coachTimeZone: string,
  from: Date = new Date(),
): Date {
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, coachTimeZone);

  for (let i = 0; i < 7; i++) {
    const dateOnly = new Date(Date.UTC(y, m - 1, d + i));
    if (dateOnly.getUTCDay() !== dayOfWeek) continue;
    return zonedTimeToUtc(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth() + 1,
      dateOnly.getUTCDate(),
      hh,
      mm,
      coachTimeZone,
    );
  }

  // Unreachable — every 7-day window contains each weekday exactly once.
  return from;
}

// Pro/Elite entitlement is 4 weekly sessions per billing cycle (spec
// section 4), not per calendar month — cycles are anchored to each
// student's own billing_anniversary_date, not a shared 1st-of-month.
// A weekly cadence doesn't divide evenly into a ~30-31 day cycle, so
// some cycles naturally contain a 5th weekly occurrence; that leftover
// occurrence simply isn't scheduled ("week off"), not billed or booked.
export const CYCLE_SESSION_CAP = 4;

// The recurring-schedule cadence: "weekly" (default, everyone today) or
// "biweekly" — an admin-only, off-the-books accommodation for a handful
// of exception students kept on via a Stripe-billed side arrangement,
// not a Kajabi offer. Capped at 2 sessions/month regardless of tier (see
// occurrencesFor's monthOccurrenceNumber branch below) rather than the
// billing-cycle-anchored CYCLE_SESSION_CAP weekly schedules use.
export type ScheduleCadence = "weekly" | "biweekly";

// The effective "sessions per cycle" cap shown on the coach/student
// dashboards. Suite tier stays unlimited (null) regardless of cadence;
// everyone else sums a per-schedule contribution — CYCLE_SESSION_CAP (4)
// per weekly slot, 2 per biweekly slot — since a student can now have
// more than one recurring_schedules row (e.g. paying for 2x/week, each
// slot capped independently by occurrencesFor's own cycle-anchor logic).
// A student with no schedule at all still gets the tier's baseline 4 —
// same as before this could ever be an array of more than one cadence,
// so a trial/no-schedule student's cap is unaffected.
export function effectiveSessionCycleCap(
  tier: string,
  cadences: (ScheduleCadence | null | undefined)[],
): number | null {
  if (tier === "suite") return null;
  if (cadences.length === 0) return CYCLE_SESSION_CAP;
  return cadences.reduce((sum: number, c) => sum + (c === "biweekly" ? 2 : CYCLE_SESSION_CAP), 0);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The cycle-start calendar date that (year, month, day) falls into,
// anchored on the same day-of-month every month — clamped for short
// months, e.g. an anchor of the 31st becomes the 30th in a 30-day month
// or the 28th/29th in February, matching how a real monthly billing
// anniversary behaves.
function cycleStartForDate(
  year: number,
  month: number,
  day: number,
  anchorDay: number,
): [number, number, number] {
  const effectiveThisMonth = Math.min(anchorDay, daysInMonth(year, month));
  if (day >= effectiveThisMonth) {
    return [year, month, effectiveThisMonth];
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const effectivePrevMonth = Math.min(anchorDay, daysInMonth(prevYear, prevMonth));
  return [prevYear, prevMonth, effectivePrevMonth];
}

// 1-indexed position of `instant` among same-weekday occurrences within
// its billing cycle — e.g. the 1st, 2nd, 3rd, 4th, or (skipped) 5th
// Wednesday since the cycle started. Cycle-date arithmetic is done in
// the coach's own zone, the same frame occurrences are already
// generated in.
function cycleOccurrenceNumber(instant: Date, anchorDay: number, timeZone: string): number {
  const [y, m, d] = zonedYearMonthDay(instant, timeZone);
  const [cy, cm, cd] = cycleStartForDate(y, m, d, anchorDay);
  const cycleStart = Date.UTC(cy, cm - 1, cd);
  const dateOnly = Date.UTC(y, m - 1, d);
  const daysSinceCycleStart = Math.round((dateOnly - cycleStart) / 86_400_000);
  return Math.floor(daysSinceCycleStart / 7) + 1;
}

// 1-indexed position of `instant` among same-weekday dates within its
// plain calendar month (not the billing cycle — deliberately unanchored
// to billing_anniversary_date, so a biweekly schedule always lands on
// the same fixed weeks regardless of when a given student's billing
// cycle starts). Occurrence #1 always falls within days 1-7 and #3
// within days 15-21, both of which exist in every month, so filtering a
// biweekly schedule down to occurrences 1 and 3 always yields exactly 2
// sessions/month — including 5-week months, where occurrences 2, 4, and
// 5 are simply the ones left out.
function monthOccurrenceNumber(instant: Date, timeZone: string): number {
  const [, , d] = zonedYearMonthDay(instant, timeZone);
  return Math.floor((d - 1) / 7) + 1;
}

// The first date matching dayOfWeek on or after startDate — plain
// calendar-date arithmetic (both sides are UTC-midnight "date only"
// values, no timezone conversion needed here since day-of-week doesn't
// depend on it). This is the anchor a biweekly schedule with an
// explicit start_date counts every-other-occurrence from.
function firstOccurrenceOnOrAfter(startDate: Date, dayOfWeek: number): Date {
  const diff = (dayOfWeek - startDate.getUTCDay() + 7) % 7;
  return new Date(startDate.getTime() + diff * 86_400_000);
}

// The [start, end) instants of the billing cycle `now` currently falls
// in — used to decide what's actually "paid for" and safe to show/cancel
// (e.g. the upcoming-sessions list). Kajabi doesn't reliably expose the
// real billing interval (monthly/quarterly/semi-annual/annual all
// exist), so this deliberately always uses a plain 1-month window rather
// than guessing the interval — the safe default per spec section 4,
// never over-showing what's confirmed paid. Falls back to a plain
// calendar month if the student has no billing_anniversary_date at all.
export function currentBillingCycleRange(
  billingAnniversaryDate: string | null | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } {
  if (!billingAnniversaryDate) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
  }

  const anchorDay = new Date(`${billingAnniversaryDate}T00:00:00Z`).getUTCDate();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const [cy, cm, cd] = cycleStartForDate(y, m, d, anchorDay);
  const start = new Date(Date.UTC(cy, cm - 1, cd));

  const nextMonth = cm === 12 ? 1 : cm + 1;
  const nextYear = cm === 12 ? cy + 1 : cy;
  const endDay = Math.min(anchorDay, daysInMonth(nextYear, nextMonth));
  const end = new Date(Date.UTC(nextYear, nextMonth - 1, endDay));

  return { start, end };
}

// The current billing cycle's own 5th same-weekday occurrence of a
// weekly recurring slot, if this cycle happens to contain one and it
// hasn't passed yet — the exact "week off" occurrencesFor() already
// leaves unscheduled (CYCLE_SESSION_CAP above) rather than a gap that
// was ever offered and skipped. Used to find a same-day/same-time
// one-off upsell opportunity for an existing weekly student (see
// lib/admin/attention-items.ts's "fifth_week_available" kind) — this
// never creates or implies a real session, only identifies the date/
// time one would go at if admin books it. Returns null if this cycle
// has no 5th occurrence of the slot, it's already passed, or it lands
// on a studio holiday (spec: studio closed that day, no session of any
// kind, sellable or not).
export function fifthWeekOccurrence(
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
  from: Date,
  billingAnniversaryDate: string | null | undefined,
  holidayDates?: Set<string>,
): Date | null {
  if (!billingAnniversaryDate) return null;

  const { end } = currentBillingCycleRange(billingAnniversaryDate, from);
  const anchorDay = new Date(`${billingAnniversaryDate}T00:00:00Z`).getUTCDate();
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, timeZone);

  // 40 days comfortably covers a cycle's own 5th weekly occurrence
  // (at most ~35 days out) without reaching into a later cycle's own
  // 5th occurrence — bounded below by `end` regardless.
  for (let i = 0; i < 40; i++) {
    const dateOnly = new Date(Date.UTC(y, m - 1, d + i));
    if (dateOnly.getTime() >= end.getTime()) break;
    if (dateOnly.getUTCDay() !== dayOfWeek) continue;

    const instant = zonedTimeToUtc(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth() + 1,
      dateOnly.getUTCDate(),
      hh,
      mm,
      timeZone,
    );
    if (instant <= from) continue;
    if (holidayDates && isHolidayInstant(instant, holidayDates)) continue;
    if (cycleOccurrenceNumber(instant, anchorDay, timeZone) === 5) return instant;
  }

  return null;
}

// A recurring slot must sit inside the coach's working hours, otherwise
// the generated sessions would be invisible on the coach calendar — that
// grid only renders cells that fall within working hours, so an
// out-of-hours session would silently vanish from the one view the coach
// actually uses. Rejecting up front beats generating ghost sessions.
export function slotFitsWorkingHours(
  workingHours: WorkingHours,
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number,
): boolean {
  const windows = workingHours?.[DAY_KEYS[dayOfWeek]] ?? [];
  const [sh, sm] = startTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = startMin + durationMinutes;

  return windows.some(([winStart, winEnd]) => {
    const [wsh, wsm] = winStart.split(":").map(Number);
    return startMin >= wsh * 60 + wsm && endMin <= windowEndMinutes(winEnd);
  });
}

// Every future occurrence of the slot within the horizon, as real UTC
// instants. Walks calendar dates in the coach's zone and converts each
// one individually so a DST shift moves the UTC instant but keeps the
// wall-clock lesson time put. When billingAnniversaryDate is given, any
// occurrence that would be the 5th of that weekday in its billing cycle
// is left out entirely (spec section 4) — no session row is ever
// created for it, rather than creating then hiding one. Same treatment
// for holidayDates (studio_holidays, migration 0055) — a studio-closed
// date is never even offered a session to skip, matching how the
// billing-cap "week off" already works. The holiday check is deliberately
// against Florida's own calendar date (isHolidayInstant), not this
// coach's zone — the studio's closure dates are fixed to one place, not
// per-coach, unlike everything else this function resolves in `timeZone`.
// A "biweekly" cadence keeps only every-other same-weekday occurrence,
// counted from the schedule's own start_date (scheduleStartDate) —
// confirmed live this matters: a schedule starting mid-month, after
// that month's own 1st same-weekday date, needs its first two
// occurrences to be "1st and 3rd from start_date", not "1st and 3rd of
// the calendar month" (the old monthOccurrenceNumber approach), which
// silently produced a completely wrong pair of dates whenever start_date
// fell after the month's own 1st occurrence (e.g. start_date landing on
// the month's 2nd-4th same-weekday date). Falls back to the old
// month-anchored behavior only when no scheduleStartDate is available
// at all (a legacy
// row predating that column) — bypasses the billing-cycle cap entirely
// either way, always landing on fixed weeks rather than the student's
// own billing date.
export function occurrencesFor(
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
  from: Date,
  weeksAhead = WEEKS_AHEAD,
  billingAnniversaryDate?: string | null,
  holidayDates?: Set<string>,
  cadence: ScheduleCadence = "weekly",
  scheduleStartDate?: Date | null,
): Date[] {
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, timeZone);
  const out: Date[] = [];
  const anchorDay = billingAnniversaryDate
    ? new Date(`${billingAnniversaryDate}T00:00:00Z`).getUTCDate()
    : null;
  const biweeklyAnchor = scheduleStartDate ? firstOccurrenceOnOrAfter(scheduleStartDate, dayOfWeek) : null;

  for (let i = 0; i < weeksAhead * 7; i++) {
    const dateOnly = new Date(Date.UTC(y, m - 1, d + i));
    if (dateOnly.getUTCDay() !== dayOfWeek) continue;

    const instant = zonedTimeToUtc(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth() + 1,
      dateOnly.getUTCDate(),
      hh,
      mm,
      timeZone,
    );
    if (instant <= from) continue;
    if (holidayDates && isHolidayInstant(instant, holidayDates)) continue;

    if (cadence === "biweekly") {
      if (biweeklyAnchor) {
        const daysSinceAnchor = Math.round((dateOnly.getTime() - biweeklyAnchor.getTime()) / 86_400_000);
        if (daysSinceAnchor % 14 !== 0) continue;
      } else {
        const occurrenceNumber = monthOccurrenceNumber(instant, timeZone);
        if (occurrenceNumber !== 1 && occurrenceNumber !== 3) continue;
      }
    } else if (anchorDay !== null) {
      const occurrenceNumber = cycleOccurrenceNumber(instant, anchorDay, timeZone);
      if (occurrenceNumber > CYCLE_SESSION_CAP) continue;
    }

    out.push(instant);
  }

  return out;
}

// Admin can set an end date when pausing a student (the pause form's
// "To" field) — this is what makes that date actually do something:
// called at the start of every materialize-recurring cron run (before
// new occurrences get generated), it flips anyone whose pause has run
// past its end date back to active and clears the pause fields, same as
// clicking "Unpause" by hand. paused_end is a plain date (inclusive —
// the student is still paused ON that date, same convention the pause
// window filter below uses via 23:59:59.999 end-of-day), so the
// cutoff is "< today", not "<=".
export async function autoResumeExpiredPauses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: expired } = await supabase
    .from("students")
    .select("id")
    .eq("subscription_status", "paused")
    .not("paused_end", "is", null)
    .lt("paused_end", today);

  if (!expired || expired.length === 0) return 0;

  await supabase
    .from("students")
    .update({ subscription_status: "active", paused_start: null, paused_end: null })
    .in(
      "id",
      expired.map((s: { id: string }) => s.id),
    );

  return expired.length;
}

interface MaterializeResult {
  created: number;
  skipped: number;
}

// Creates any missing future occurrences for active schedules. Idempotent:
// an occurrence is skipped if the student already has ANY session at that
// exact instant — which deliberately includes cancelled ones, so a lesson
// the student cancelled doesn't silently reappear on the next top-up run.
export async function materializeRecurringSessions(
  // Accepts either the RLS-scoped server client or the service-role admin
  // client (the cron path), so both share one implementation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { studentId?: string; scheduleId?: string } = {},
): Promise<MaterializeResult> {
  let query = supabase
    .from("recurring_schedules")
    .select("id, student_id, coach_id, day_of_week, start_time, duration_minutes, start_date, cadence")
    .eq("active", true);

  if (opts.studentId) query = query.eq("student_id", opts.studentId);
  if (opts.scheduleId) query = query.eq("id", opts.scheduleId);

  const { data: schedules } = await query;
  const now = new Date();
  let created = 0;
  let skipped = 0;
  const holidayDates = await getHolidayDateKeys(supabase);

  for (const schedule of schedules ?? []) {
    const [{ data: coach }, { data: student }, { data: cancelRequest }] = await Promise.all([
      supabase.from("coaches").select("timezone").eq("id", schedule.coach_id).single(),
      supabase
        .from("students")
        .select("billing_anniversary_date, subscription_status, paused_start, paused_end")
        .eq("id", schedule.student_id)
        .single(),
      // A pending/approved cancellation (student_requests, migration
      // 0034/0038) means admin either hasn't gotten to it yet or has
      // confirmed it in Kajabi — either way, nothing further should
      // populate past the billing cycle it's effective at ("denied" =
      // admin retained the student, so this intentionally excludes it).
      supabase
        .from("student_requests")
        .select("effective_date")
        .eq("student_id", schedule.student_id)
        .eq("type", "cancel_subscription")
        .in("status", ["pending", "approved"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const timeZone = coach?.timezone ?? "America/New_York";

    // A schedule change can be set to take effect on a future date (see
    // app/api/admin/recurring-schedule/route.ts) rather than immediately
    // — occurrences before that date belong to whatever pattern created
    // them and are left alone, so materialization never walks earlier
    // than start_date even though it always starts scanning from `now`.
    const startDate = schedule.start_date
      ? new Date(`${schedule.start_date}T00:00:00Z`)
      : null;
    const effectiveFrom = startDate && startDate > now ? startDate : now;

    let instants = occurrencesFor(
      schedule.day_of_week,
      schedule.start_time,
      timeZone,
      effectiveFrom,
      WEEKS_AHEAD,
      student?.billing_anniversary_date,
      holidayDates,
      schedule.cadence ?? "weekly",
      startDate,
    );

    // A paused student's slot stays reserved, not billed (spec section
    // 3: "no sessions/billing accrue during the pause") — skip
    // generating real session rows for any occurrence inside the pause
    // window. getHeldRecurringSlots (below) is what surfaces this same
    // window on the coach calendar and blocks other students from
    // booking into it, without a session row existing here.
    if (student?.subscription_status === "paused" && student.paused_start) {
      const pauseStart = new Date(`${student.paused_start}T00:00:00Z`);
      const pauseEnd = student.paused_end ? new Date(`${student.paused_end}T23:59:59.999Z`) : null;
      instants = instants.filter((i) => i < pauseStart || (pauseEnd !== null && i > pauseEnd));
    }

    if (cancelRequest?.effective_date) {
      const cutoff = new Date(`${cancelRequest.effective_date}T00:00:00Z`);
      instants = instants.filter((i) => i < cutoff);
    }

    if (instants.length === 0) continue;

    const horizonEnd = instants[instants.length - 1];

    // Any existing session for this student in the window, whatever its
    // status — a cancelled occurrence still counts as "handled".
    const { data: existing } = await supabase
      .from("sessions")
      .select("scheduled_at")
      .eq("student_id", schedule.student_id)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString());

    const taken = new Set(
      (existing ?? []).map((s: { scheduled_at: string }) =>
        new Date(s.scheduled_at).getTime(),
      ),
    );

    // The coach could also be busy with another student at that instant
    // (e.g. a makeup booked into this slot before the schedule existed).
    // Only a with-notice cancellation actually frees the slot back up —
    // a no-notice (late) cancellation stays blocked, same distinction
    // app/api/booking/slots/route.ts makes.
    const { data: coachBusy } = await supabase
      .from("sessions")
      .select("scheduled_at")
      .eq("actual_coach_id", schedule.coach_id)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString())
      .not("status", "eq", "cancelled-with-notice");

    const coachTaken = new Set(
      (coachBusy ?? []).map((s: { scheduled_at: string }) =>
        new Date(s.scheduled_at).getTime(),
      ),
    );

    const rows = [];
    for (const instant of instants) {
      if (taken.has(instant.getTime()) || coachTaken.has(instant.getTime())) {
        skipped++;
        continue;
      }
      rows.push({
        student_id: schedule.student_id,
        actual_coach_id: schedule.coach_id,
        scheduled_at: instant.toISOString(),
        duration_minutes: schedule.duration_minutes,
        status: "scheduled",
        recurring_schedule_id: schedule.id,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("sessions").insert(rows);
      if (!error) created += rows.length;
    }
  }

  return { created, skipped };
}

export interface HeldRecurringSlot {
  scheduledAt: string;
  durationMinutes: number;
  studentName: string;
}

// A paused student's regular slot stays reserved — no session row exists
// for it (materializeRecurringSessions skips generating one during the
// pause window, above), so without this it would silently look wide
// open on the coach calendar and be bookable by any other student.
// Recomputes which recurring-schedule occurrences fall inside a
// currently-paused student's pause window, for a given date range.
export async function getHeldRecurringSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  coachId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<HeldRecurringSlot[]> {
  const { data: schedules } = await supabase
    .from("recurring_schedules")
    .select("day_of_week, start_time, duration_minutes, cadence, start_date, students(name, subscription_status, paused_start, paused_end)")
    .eq("coach_id", coachId)
    .eq("active", true);

  const { data: coach } = await supabase.from("coaches").select("timezone").eq("id", coachId).single();
  const timeZone = coach?.timezone ?? "America/New_York";

  const weeksAhead = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  const held: HeldRecurringSlot[] = [];
  const holidayDates = await getHolidayDateKeys(supabase);

  for (const schedule of schedules ?? []) {
    const student = Array.isArray(schedule.students) ? schedule.students[0] : schedule.students;
    if (!student || student.subscription_status !== "paused" || !student.paused_start) continue;

    const pauseStart = new Date(`${student.paused_start}T00:00:00Z`);
    const pauseEnd = student.paused_end ? new Date(`${student.paused_end}T23:59:59.999Z`) : null;

    const occurrences = occurrencesFor(
      schedule.day_of_week,
      schedule.start_time,
      timeZone,
      new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000),
      weeksAhead,
      null,
      holidayDates,
      schedule.cadence ?? "weekly",
      schedule.start_date ? new Date(`${schedule.start_date}T00:00:00Z`) : null,
    );

    for (const occ of occurrences) {
      if (occ < rangeStart || occ > rangeEnd) continue;
      if (occ < pauseStart || (pauseEnd !== null && occ > pauseEnd)) continue;
      held.push({
        scheduledAt: occ.toISOString(),
        durationMinutes: schedule.duration_minutes,
        studentName: student.name,
      });
    }
  }

  return held;
}
