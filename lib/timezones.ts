// Client-safe timezone helpers for the booking calendar. Detection uses
// the browser's own Intl-resolved zone (same mechanism Calendly itself
// relies on) — no geolocation permission prompt involved. Falls back to
// Eastern if detection isn't available for some reason.
export const DEFAULT_TIMEZONE = "America/New_York";

// IANA's "America/*" namespace covers both the US and Canada with no
// built-in way to tell them apart by name alone (e.g. Edmonton vs.
// Denver) — curated and labeled by country explicitly so students don't
// have to guess.
export const US_TIMEZONES: { tz: string; label: string }[] = [
  { tz: "America/New_York", label: "Eastern Time — New York" },
  { tz: "America/Chicago", label: "Central Time — Chicago" },
  { tz: "America/Denver", label: "Mountain Time — Denver" },
  { tz: "America/Phoenix", label: "Mountain Time, no DST — Phoenix" },
  { tz: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { tz: "America/Anchorage", label: "Alaska Time — Anchorage" },
  { tz: "Pacific/Honolulu", label: "Hawaii Time — Honolulu" },
];

export const CANADA_TIMEZONES: { tz: string; label: string }[] = [
  { tz: "America/St_Johns", label: "Newfoundland Time — St. John's" },
  { tz: "America/Halifax", label: "Atlantic Time — Halifax" },
  { tz: "America/Toronto", label: "Eastern Time — Toronto" },
  { tz: "America/Winnipeg", label: "Central Time — Winnipeg" },
  { tz: "America/Edmonton", label: "Mountain Time — Edmonton" },
  { tz: "America/Vancouver", label: "Pacific Time — Vancouver" },
];

export const OTHER_COMMON_TIMEZONES = [
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function allTimezones(): string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      return supportedValuesOf("timeZone");
    }
  } catch {
    // fall through to the curated list
  }
  return [
    ...US_TIMEZONES.map((z) => z.tz),
    ...CANADA_TIMEZONES.map((z) => z.tz),
    ...OTHER_COMMON_TIMEZONES,
  ];
}

export function timezoneLabel(tz: string): string {
  try {
    const offset =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${tz.replace(/_/g, " ")} (${offset})`;
  } catch {
    return tz;
  }
}
