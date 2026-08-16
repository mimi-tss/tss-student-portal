// Client-safe timezone helpers for the booking calendar. Detection uses
// the browser's own Intl-resolved zone (same mechanism Calendly itself
// relies on) — no geolocation permission prompt involved. Falls back to
// Eastern if detection isn't available for some reason.
export const DEFAULT_TIMEZONE = "America/New_York";

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
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
  return COMMON_TIMEZONES;
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
