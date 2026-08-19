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
    <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
      <span className="hidden sm:inline">Viewing in</span>
      <span className="font-medium text-gray-700">{timezoneAbbreviation(timeZone)}</span>
      <TimeZoneSelect
        value={timeZone}
        onChange={setTimeZone}
        className="rounded border px-1.5 py-0.5 text-xs"
      />
    </label>
  );
}
