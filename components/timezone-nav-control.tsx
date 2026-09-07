"use client";

import { timezoneAbbreviation } from "@/lib/timezone";
import { useTimeZone } from "./timezone-context";
import TimeZoneSelect from "./timezone-select";

// Dropped into every header nav (student/admin/coach layouts) so the
// current display timezone is always visible and always changeable, per
// spec: times are shown in this zone everywhere, defaulting to Eastern
// for admin/coach and the viewer's detected local zone for students.
export default function TimeZoneNavControl() {
  const { timeZone, setTimeZone } = useTimeZone();

  return (
    // flex-wrap so this degrades to two lines instead of overflowing when
    // squeezed into a narrow container (the admin sidebar footer, ~260px,
    // vs. the wide header bar this was originally sized for).
    <label className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <span className="hidden sm:inline">Viewing in</span>
      <span className="font-medium text-[var(--text)]">{timezoneAbbreviation(timeZone)}</span>
      <TimeZoneSelect
        value={timeZone}
        onChange={setTimeZone}
        className="max-w-[45vw] rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text)]"
      />
    </label>
  );
}
