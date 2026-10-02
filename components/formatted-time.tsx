"use client";

import { formatDateInZone, formatDateTimeInZone, formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "./timezone-context";

// Drop-in replacements for `{new Date(x).toLocaleString()}` etc. — reads
// the viewer's current display timezone from context so every date/time
// in the app renders in the same zone (Eastern by default for
// admin/coach, the viewer's detected local zone for students) with an
// explicit zone label, no seconds, and US numeric date order. Client
// components so they can sit inside a Server Component tree and still
// reach the context.
export function FormattedDate({ value, className }: { value: string; className?: string }) {
  const { timeZone } = useTimeZone();
  return <span className={className}>{formatDateInZone(value, timeZone)}</span>;
}

export function FormattedTime({ value, className }: { value: string; className?: string }) {
  const { timeZone } = useTimeZone();
  return <span className={className}>{formatTimeInZone(value, timeZone)}</span>;
}

// weekday: prefix the day name ("Thu, 10/2/2026, 2:30 PM ET") — in the
// viewer's zone, so it always agrees with the date shown.
export function FormattedDateTime({
  value,
  className,
  weekday = false,
}: {
  value: string;
  className?: string;
  weekday?: boolean;
}) {
  const { timeZone } = useTimeZone();
  const day = weekday
    ? `${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(value))}, `
    : "";
  return (
    <span className={className}>
      {day}
      {formatDateTimeInZone(value, timeZone)}
    </span>
  );
}
