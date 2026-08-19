"use client";

import { useEffect, useState } from "react";
import {
  CANADA_TIMEZONES,
  OTHER_COMMON_TIMEZONES,
  US_TIMEZONES,
  allTimezones,
  timezoneLabel,
} from "@/lib/timezones";

// The full grouped picker (US / Canada / Other common / everything else)
// originally built for the booking calendar — extracted here so the
// header nav's "change my view timezone" control and the booking page
// share one implementation instead of drifting apart.
export default function TimeZoneSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (tz: string) => void;
  className?: string;
}) {
  const [timezoneList, setTimezoneList] = useState<string[]>([]);

  // supportedValuesOf("timeZone") is only available client-side (and
  // isn't worth the payload server-rendered) — populated after mount.
  useEffect(() => {
    setTimezoneList(allTimezones());
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "rounded border p-1"}
    >
      {!timezoneList.includes(value) &&
        !US_TIMEZONES.some((z) => z.tz === value) &&
        !CANADA_TIMEZONES.some((z) => z.tz === value) && (
          <option value={value}>{timezoneLabel(value)}</option>
        )}
      <optgroup label="United States">
        {US_TIMEZONES.map((z) => (
          <option key={z.tz} value={z.tz}>
            {z.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Canada">
        {CANADA_TIMEZONES.map((z) => (
          <option key={z.tz} value={z.tz}>
            {z.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Other">
        {OTHER_COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {timezoneLabel(tz)}
          </option>
        ))}
      </optgroup>
      <optgroup label="All timezones">
        {timezoneList
          .filter(
            (tz) =>
              !US_TIMEZONES.some((z) => z.tz === tz) &&
              !CANADA_TIMEZONES.some((z) => z.tz === tz) &&
              !OTHER_COMMON_TIMEZONES.includes(tz),
          )
          .map((tz) => (
            <option key={tz} value={tz}>
              {timezoneLabel(tz)}
            </option>
          ))}
      </optgroup>
    </select>
  );
}
