export type WorkingHours = Record<string, [string, string][]>;

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
