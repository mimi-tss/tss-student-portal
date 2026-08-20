"use client";

import { timezoneAbbreviation } from "@/lib/timezone";
import { useTimeZone } from "./timezone-context";
import TimeZoneSelect from "./timezone-select";

// Dropped into every header nav (student/admin/coach layouts) so the
// current display timezone is always visible and always changeable, per
// spec: times are shown in this zone everywhere, defaulting to Eastern
// for admin/coach and the viewer's detected local zone for students.
// `dark` switches to light-on-dark colors for the student layout's new
// theme (TSS_App_Spec_1.md section 8) — admin/coach keep the default.
export default function TimeZoneNavControl({ dark = false }: { dark?: boolean }) {
  const { timeZone, setTimeZone } = useTimeZone();

  return (
    <label
      className={
        dark
          ? "flex items-center gap-1.5 text-xs text-[#9997ab]"
          : "ml-auto flex items-center gap-1.5 text-xs text-gray-500"
      }
    >
      <span className="hidden sm:inline">Viewing in</span>
      <span className={dark ? "font-medium text-[#f4f0e6]" : "font-medium text-gray-700"}>
        {timezoneAbbreviation(timeZone)}
      </span>
      <TimeZoneSelect
        value={timeZone}
        onChange={setTimeZone}
        className={
          dark
            ? "rounded border border-[#2c2c3d] bg-[#20202f] px-1.5 py-0.5 text-xs text-[#f4f0e6]"
            : "rounded border px-1.5 py-0.5 text-xs"
        }
      />
    </label>
  );
}
