// Formatting helpers for plain `date` columns (birth_date,
// coach_start_date_override — "YYYY-MM-DD", no time component) and
// tenure durations. Deliberately NOT routed through formatDateInZone
// (lib/timezone.ts): that parses the string as a UTC instant, so a
// timezone west of UTC (e.g. admin's default Eastern) would display the
// day before what was actually stored — these have no time-of-day to
// convert, so they're parsed as local calendar-date components instead.
export function formatPlainDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

// Whole-years age from a plain "YYYY-MM-DD" birth_date — parsed as
// local calendar-date components for the same reason formatPlainDate
// is (no time-of-day to convert, so no UTC-instant timezone shift).
// Computed on read, never stored, so it's never stale.
export function calculateAge(birthDate: string): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  const birth = new Date(year, month - 1, day);
  const now = new Date();

  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age;
}

// "4 years 2 months" style tenure — whole months only (day-of-month
// differences round down), which is precise enough for "how long has
// this student been with us" and avoids an awkward "...and 12 days".
export function formatTenure(sinceIso: string): string {
  const since = new Date(sinceIso);
  const now = new Date();

  let months =
    (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth());
  if (now.getDate() < since.getDate()) months -= 1;
  months = Math.max(0, months);

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (remainingMonths > 0 || years === 0) {
    parts.push(`${remainingMonths} month${remainingMonths === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}
