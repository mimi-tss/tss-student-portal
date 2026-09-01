export type WorkingHours = Record<string, [string, string][]>;

// A window's end time "00:00" means the end of THIS day (24:00), not
// its start — a window like ["20:30","00:00"] (e.g. a coach's 8:30pm-
// midnight session) is a real, valid same-day window, but reading "00:00"
// literally as 0 minutes makes it compare as ending before it starts.
// Every consumer that turns a window's END string into same-day
// minutes-from-midnight must go through this instead of a raw
// `eh * 60 + em`, or such a window silently matches nothing.
export function windowEndMinutes(end: string): number {
  const [h, m] = end.split(":").map(Number);
  return h === 0 && m === 0 ? 24 * 60 : h * 60 + m;
}

// Same idea, for building the actual UTC instant a window ends at
// (zonedTimeToUtc-based call sites): "00:00" means midnight at the
// START of the NEXT calendar day, not this one. `day` may be 0 or exceed
// the month's real length going in — callers already rely on
// zonedTimeToUtc's own Date.UTC normalizing that, same as day+1 here.
export function windowEndDateParts(day: number, end: string): { day: number; hour: number; minute: number } {
  const [h, m] = end.split(":").map(Number);
  return h === 0 && m === 0 ? { day: day + 1, hour: 0, minute: 0 } : { day, hour: h, minute: m };
}

export interface CoachHoursSource {
  workingHours: WorkingHours;
  pendingWorkingHours?: WorkingHours | null;
  pendingEffectiveDate?: string | null; // "YYYY-MM-DD"
}

// A coach's working hours as of one specific calendar date — resolves a
// queued future schedule change (coaches.pending_working_hours /
// pending_effective_date, migration 0044) against whichever date is
// actually being viewed or booked, not "now". The whole point of the
// effective-date field is that a change made today doesn't retroactively
// (or prematurely) apply to dates on the wrong side of it — every
// consumer that walks a date range must resolve per-date, not once for
// the whole request.
//
// Plain string comparison is safe: both sides are always "YYYY-MM-DD".
export function resolveWorkingHoursForDate(coach: CoachHoursSource, dateKey: string): WorkingHours {
  if (coach.pendingWorkingHours && coach.pendingEffectiveDate && dateKey >= coach.pendingEffectiveDate) {
    return coach.pendingWorkingHours;
  }
  return coach.workingHours;
}
