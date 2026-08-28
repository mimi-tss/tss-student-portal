import { zonedYearMonthDay } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Studio-wide closure dates (studio_holidays, migration 0055) — distinct
// from a per-coach coach_blocks entry: every coach is closed at once, no
// one can book, and any already-materialized session gets auto-
// forfeited with no makeup credit rather than just being blocked going
// forward. Shared by recurring materialization (skip generating on
// these dates), booking (reject a request landing on one), and the
// daily cron's retroactive forfeit sweep below.
export async function getHolidayDateKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Set<string>> {
  const { data } = await supabase.from("studio_holidays").select("date");
  return new Set((data ?? []).map((h: { date: string }) => h.date));
}

// The studio itself is in Florida — "closed Dec 25" means Dec 25
// midnight-to-midnight *there*, regardless of which zone a given coach
// happens to be in. Every other "which day is this" check in this app
// (working hours, recurring occurrences) deliberately uses the COACH's
// own zone since those are the coach's own wall-clock hours; holidays
// are the opposite — a fixed studio-wide policy anchored to one place,
// so this always resolves against DEFAULT_TIMEZONE (America/New_York,
// Florida's own zone) no matter whose session it is.
export function isHolidayInstant(instant: Date, holidayDates: Set<string>): boolean {
  const [y, m, d] = zonedYearMonthDay(instant, DEFAULT_TIMEZONE);
  const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return holidayDates.has(dateKey);
}

interface ForfeitResult {
  sessionsForfeited: number;
  groupLessonsCancelled: number;
}

// Retroactively forfeits any 'scheduled' session (and cancels any
// not-yet-cancelled group lesson) that lands on a studio holiday, in
// Florida's own calendar day — covers both a date just added to
// studio_holidays and any occurrence that slipped through before this
// feature existed. Deliberately does NOT touch makeup_credits at all
// (no reinstatement, no new credit) — "auto forfeit, no makeup" per the
// studio's own policy, unlike a normal within-notice cancellation
// (lib/booking/cancel-session.ts). Idempotent — only ever matches rows
// not already forfeited/cancelled, so it's safe to call on every daily
// cron run indefinitely.
export async function forfeitHolidaySessions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ForfeitResult> {
  const holidayDates = await getHolidayDateKeys(supabase);
  if (holidayDates.size === 0) {
    return { sessionsForfeited: 0, groupLessonsCancelled: 0 };
  }

  const sortedDates = Array.from(holidayDates).sort();
  // A day-wide buffer on each end covers Florida's own UTC offset
  // without having to reason about exact boundaries here — the real
  // match happens below via isHolidayInstant.
  const rangeStart = new Date(`${sortedDates[0]}T00:00:00Z`);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);

  const [{ data: sessions }, { data: groupLessons }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, scheduled_at")
      .eq("status", "scheduled")
      .gte("scheduled_at", rangeStart.toISOString())
      .lt("scheduled_at", rangeEnd.toISOString()),
    supabase
      .from("group_lessons")
      .select("id, scheduled_at")
      .is("cancelled_at", null)
      .gte("scheduled_at", rangeStart.toISOString())
      .lt("scheduled_at", rangeEnd.toISOString()),
  ]);

  const sessionIdsToForfeit = (sessions ?? [])
    .filter((s: { scheduled_at: string }) => isHolidayInstant(new Date(s.scheduled_at), holidayDates))
    .map((s: { id: string }) => s.id);

  const groupLessonIdsToCancel = (groupLessons ?? [])
    .filter((g: { scheduled_at: string }) => isHolidayInstant(new Date(g.scheduled_at), holidayDates))
    .map((g: { id: string }) => g.id);

  if (sessionIdsToForfeit.length > 0) {
    await supabase.from("sessions").update({ status: "holiday" }).in("id", sessionIdsToForfeit);
  }
  if (groupLessonIdsToCancel.length > 0) {
    await supabase
      .from("group_lessons")
      .update({ cancelled_at: new Date().toISOString() })
      .in("id", groupLessonIdsToCancel);
  }

  return {
    sessionsForfeited: sessionIdsToForfeit.length,
    groupLessonsCancelled: groupLessonIdsToCancel.length,
  };
}
